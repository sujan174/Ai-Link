use axum::http::Method;

use crate::errors::AppError;
use crate::middleware::shadow;
use crate::models::policy::{Policy, PolicyMode, Rule};

pub enum PolicyDecision {
    Allow,
    HitlRequired,
}

pub struct EvaluationResult {
    pub decision: PolicyDecision,
    pub shadow_violations: Vec<String>,
}

/// Evaluate all policy rules against the incoming request.
/// Returns EvaluationResult with decision and any shadow violations.
/// Returns Err(AppError) if an Enforce policy blocks the request.
#[tracing::instrument(skip(policies))]
pub fn evaluate_rules(
    policies: &[Policy],
    method: &Method,
    path: &str,
) -> Result<EvaluationResult, AppError> {
    let mut hitl_required = false;
    let mut shadow_violations = Vec::new();

    for policy in policies {
        for rule in &policy.rules {
            // Check for HITL rule first
            if let Rule::HumanApproval { .. } = rule {
                // If HITL is enabled, we mark it.
                // We continue to check other rules (whitelists/denylists)
                hitl_required = true;
                continue;
            }

            if let Some(reason) = check_rule(rule, method, path) {
                match policy.mode {
                    PolicyMode::Shadow => {
                        shadow::log_shadow_violation(&policy.name, rule.rule_type(), &reason);
                        shadow_violations.push(format!("policy '{}': {}", policy.name, reason));
                        // Shadow: don't block, continue
                    }
                    PolicyMode::Enforce => {
                        return Err(AppError::PolicyDenied {
                            policy: policy.name.clone(),
                            reason,
                        });
                    }
                }
            }
        }
    }

    Ok(EvaluationResult {
        decision: if hitl_required {
            PolicyDecision::HitlRequired
        } else {
            PolicyDecision::Allow
        },
        shadow_violations,
    })
}

/// Returns Some(reason) if the rule would deny this request, None if it passes.
fn check_rule(rule: &Rule, method: &Method, path: &str) -> Option<String> {
    match rule {
        Rule::MethodWhitelist { methods } => {
            let method_str = method.as_str();
            if !methods.iter().any(|m| m.eq_ignore_ascii_case(method_str)) {
                return Some(format!(
                    "method {} not in whitelist {:?}",
                    method_str, methods
                ));
            }
        }
        Rule::PathWhitelist { patterns } => {
            let matched = patterns.iter().any(|p| path_matches(p, path));
            if !matched {
                return Some(format!("path {} not in whitelist", path));
            }
        }
        Rule::RateLimit { .. } => {}
        Rule::SpendCap { .. } => {}
        Rule::HumanApproval { .. } => {
            // Handled in evaluate_rules explicitly
        }
        Rule::TimeWindow { .. } => {
            // TODO: check current time against allowed windows
        }
        Rule::IpAllowlist { .. } => {
            // TODO: check source IP against CIDR list
        }
    }
    None
}

/// Simple glob-style path matching.
/// Supports trailing `*` wildcard only (e.g. "/v1/charges/*" matches "/v1/charges/ch_123").
fn path_matches(pattern: &str, path: &str) -> bool {
    if pattern == "*" || pattern == "/*" {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix("/*") {
        return path.starts_with(prefix);
    }
    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len() - 1];
        return path.starts_with(prefix);
    }
    pattern == path
}

impl Rule {
    pub fn rule_type(&self) -> &'static str {
        match self {
            Rule::MethodWhitelist { .. } => "method_whitelist",
            Rule::PathWhitelist { .. } => "path_whitelist",
            Rule::RateLimit { .. } => "rate_limit",
            Rule::SpendCap { .. } => "spend_cap",
            Rule::HumanApproval { .. } => "human_approval",
            Rule::TimeWindow { .. } => "time_window",
            Rule::IpAllowlist { .. } => "ip_allowlist",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn make_policy(rules: Vec<Rule>) -> Policy {
        Policy {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            mode: PolicyMode::Enforce,
            rules,
        }
    }

    #[test]
    fn test_method_whitelist() {
        let policy = make_policy(vec![Rule::MethodWhitelist {
            methods: vec!["GET".to_string(), "POST".to_string()],
        }]);

        let res = evaluate_rules(&[policy], &Method::GET, "/").unwrap();
        assert!(matches!(res.decision, PolicyDecision::Allow));

        let policy2 = make_policy(vec![Rule::MethodWhitelist {
            methods: vec!["GET".to_string(), "POST".to_string()],
        }]);
        assert!(evaluate_rules(&[policy2], &Method::DELETE, "/").is_err());
    }

    #[test]
    fn test_path_whitelist_glob() {
        let policy = make_policy(vec![Rule::PathWhitelist {
            patterns: vec!["/v1/*".to_string(), "/health".to_string()],
        }]);

        let p_ref = std::slice::from_ref(&policy);

        // Exact match
        let res = evaluate_rules(p_ref, &Method::GET, "/health").unwrap();
        assert!(matches!(res.decision, PolicyDecision::Allow));

        // Glob match
        let res2 = evaluate_rules(p_ref, &Method::GET, "/v1/chat").unwrap();
        assert!(matches!(res2.decision, PolicyDecision::Allow));

        // Mismatch
        assert!(evaluate_rules(p_ref, &Method::GET, "/admin").is_err());
    }

    #[test]
    fn test_hitl_flag() {
        let policy = make_policy(vec![Rule::HumanApproval {
            timeout: "10m".to_string(),
            fallback: "deny".to_string(),
        }]);

        let result = evaluate_rules(&[policy], &Method::POST, "/charge").unwrap();
        assert!(matches!(result.decision, PolicyDecision::HitlRequired));
    }

    #[test]
    fn test_explicit_deny_beats_hitl() {
        // If method is forbidden, HITL shouldn't even trigger (fail fast)
        let policy = make_policy(vec![
            Rule::MethodWhitelist {
                methods: vec!["GET".to_string()],
            },
            Rule::HumanApproval {
                timeout: "10m".to_string(),
                fallback: "deny".to_string(),
            },
        ]);

        let result = evaluate_rules(&[policy], &Method::POST, "/charge");
        assert!(result.is_err()); // Should be PolicyDenied
    }
}
