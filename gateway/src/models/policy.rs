use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Policy ───────────────────────────────────────────────────

/// A policy is a named collection of condition→action rules.
///
/// Policies are attached to tokens (or projects/global scope) and evaluated
/// on every proxied request. Each rule is checked in order; the first matching
/// rule's actions are executed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub id: Uuid,
    pub name: String,
    /// Evaluation phase: "pre" (before upstream) or "post" (after upstream).
    #[serde(default = "default_phase")]
    pub phase: Phase,
    /// Enforcement mode.
    #[serde(default)]
    pub mode: PolicyMode,
    /// Ordered list of condition→action rules.
    pub rules: Vec<Rule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Pre,
    Post,
}

fn default_phase() -> Phase {
    Phase::Pre
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PolicyMode {
    #[default]
    Enforce,
    Shadow,
}

// ── Rule ─────────────────────────────────────────────────────

/// A single condition→action rule.
///
/// ```json
/// {
///   "when": { "field": "request.body.amount", "op": "gt", "value": 5000 },
///   "then": { "action": "deny", "status": 403, "message": "Too expensive" }
/// }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    /// Condition tree that must evaluate to `true` for actions to fire.
    /// If omitted, the rule always matches (catch-all).
    #[serde(default = "Condition::always")]
    pub when: Condition,
    /// One or more actions to execute when the condition matches.
    /// Accepts a single action object or an array of actions.
    #[serde(deserialize_with = "deserialize_actions")]
    pub then: Vec<Action>,
}

// ── Condition ────────────────────────────────────────────────

/// A boolean expression tree evaluated against the request context.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Condition {
    /// All children must be true (AND).
    All {
        all: Vec<Condition>,
    },
    /// At least one child must be true (OR).
    Any {
        any: Vec<Condition>,
    },
    /// Negation.
    Not {
        not: Box<Condition>,
    },
    /// Leaf node: compare a field against a value.
    Check {
        field: String,
        op: Operator,
        value: serde_json::Value,
    },
    /// Always true (catch-all). Serialized as `{"always": true}`.
    Always {
        #[serde(default = "default_true")]
        always: bool,
    },
}

fn default_true() -> bool {
    true
}

impl Condition {
    /// Create a catch-all condition that always matches.
    pub fn always() -> Self {
        Condition::Always { always: true }
    }
}

// ── Operator ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Operator {
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
    In,
    Glob,
    Regex,
    Contains,
    Exists,
    StartsWith,
    EndsWith,
}

// ── Action ───────────────────────────────────────────────────

/// An enforcement action to execute when a rule matches.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    /// Block the request with a custom status code and message.
    Deny {
        #[serde(default = "default_deny_status")]
        status: u16,
        #[serde(default = "default_deny_message")]
        message: String,
    },
    /// Trigger Human-in-the-Loop approval.
    RequireApproval {
        #[serde(default = "default_timeout")]
        timeout: String,
        #[serde(default = "default_fallback")]
        fallback: String,
        /// Optional notification config (Slack, webhook, etc.)
        #[serde(default)]
        notify: Option<NotifyConfig>,
    },
    /// Apply a rate limit.
    RateLimit {
        window: String,
        max_requests: u64,
        #[serde(default)]
        key: RateLimitKey,
    },
    /// Artificially delay the request.
    Throttle {
        delay_ms: u64,
    },
    /// Redact sensitive data from request or response body.
    Redact {
        #[serde(default)]
        direction: RedactDirection,
        #[serde(default)]
        patterns: Vec<String>,
        #[serde(default)]
        fields: Vec<String>,
    },
    /// Transform the request (set headers, append system prompt, etc.)
    Transform {
        operations: Vec<TransformOp>,
    },
    /// Override body fields (e.g. force model downgrade).
    Override {
        set_body_fields: std::collections::HashMap<String, serde_json::Value>,
    },
    /// Log a message without blocking.
    Log {
        #[serde(default = "default_log_level")]
        level: String,
        #[serde(default)]
        tags: std::collections::HashMap<String, String>,
    },
    /// Add metadata tags to the audit log entry.
    Tag {
        key: String,
        value: String,
    },
    /// Fire an external webhook.
    Webhook {
        url: String,
        #[serde(default = "default_webhook_timeout")]
        timeout_ms: u64,
        #[serde(default)]
        on_fail: OnFail,
    },
}

// ── Action Sub-types ─────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RateLimitKey {
    #[default]
    PerToken,
    PerAgent,
    PerIp,
    PerUser,
    Global,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedactDirection {
    Request,
    Response,
    #[default]
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TransformOp {
    SetHeader { name: String, value: String },
    RemoveHeader { name: String },
    AppendSystemPrompt { text: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotifyConfig {
    #[serde(rename = "type")]
    pub notify_type: String, // "slack", "webhook"
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnFail {
    #[default]
    Allow,
    Deny,
}

// ── Defaults ─────────────────────────────────────────────────

fn default_deny_status() -> u16 {
    403
}
fn default_deny_message() -> String {
    "request blocked by policy".to_string()
}
fn default_timeout() -> String {
    "30m".to_string()
}
fn default_fallback() -> String {
    "deny".to_string()
}
fn default_log_level() -> String {
    "warn".to_string()
}
fn default_webhook_timeout() -> u64 {
    5000
}

// ── Serde Helpers ────────────────────────────────────────────

/// Deserialize `then` as either a single action or an array of actions.
fn deserialize_actions<'de, D>(deserializer: D) -> Result<Vec<Action>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OneOrMany {
        One(Action),
        Many(Vec<Action>),
    }

    match OneOrMany::deserialize(deserializer)? {
        OneOrMany::One(a) => Ok(vec![a]),
        OneOrMany::Many(v) => Ok(v),
    }
}

// ── Result Types ─────────────────────────────────────────────

/// The result of evaluating all policies against a request.
#[derive(Debug, Default)]
pub struct EvalOutcome {
    /// Actions to execute (in order).
    pub actions: Vec<TriggeredAction>,
    /// Shadow-mode violations (logged but not enforced).
    pub shadow_violations: Vec<String>,
}

/// An action that was triggered by a specific policy+rule.
#[derive(Debug, Clone)]
pub struct TriggeredAction {
    pub policy_id: Uuid,
    pub policy_name: String,
    pub rule_index: usize,
    pub action: Action,
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Deserialization: Actions ──────────────────────────────

    #[test]
    fn test_deserialize_deny_action() {
        let json = r#"{ "action": "deny", "status": 429, "message": "slow down" }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Deny { status, message } => {
                assert_eq!(status, 429);
                assert_eq!(message, "slow down");
            }
            _ => panic!("Expected Deny, got {:?}", action),
        }
    }

    #[test]
    fn test_deserialize_deny_default_status() {
        let json = r#"{ "action": "deny", "message": "blocked" }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Deny { status, .. } => assert_eq!(status, 403), // default
            _ => panic!("Expected Deny"),
        }
    }

    #[test]
    fn test_deserialize_require_approval() {
        let json = r#"{ "action": "require_approval", "timeout": "30m", "fallback": "deny" }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::RequireApproval { timeout, fallback, notify } => {
                assert_eq!(timeout, "30m");
                assert_eq!(fallback, "deny");
                assert!(notify.is_none());
            }
            _ => panic!("Expected RequireApproval"),
        }
    }

    #[test]
    fn test_deserialize_require_approval_with_notify() {
        let json = r##"{
            "action": "require_approval",
            "timeout": "1h",
            "fallback": "allow",
            "notify": { "type": "slack", "channel": "#alerts" }
        }"##;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::RequireApproval { notify, .. } => {
                let n = notify.unwrap();
                assert_eq!(n.notify_type, "slack");
                assert_eq!(n.channel.as_deref().unwrap(), "#alerts");
            }
            _ => panic!("Expected RequireApproval"),
        }
    }

    #[test]
    fn test_deserialize_rate_limit_default_key() {
        let json = r#"{ "action": "rate_limit", "window": "5m", "max_requests": 50 }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::RateLimit { window, max_requests, key } => {
                assert_eq!(window, "5m");
                assert_eq!(max_requests, 50);
                assert!(matches!(key, RateLimitKey::PerToken)); // default
            }
            _ => panic!("Expected RateLimit"),
        }
    }

    #[test]
    fn test_deserialize_rate_limit_all_keys() {
        for (key_str, expected) in [
            ("per_token", RateLimitKey::PerToken),
            ("per_agent", RateLimitKey::PerAgent),
            ("per_ip", RateLimitKey::PerIp),
            ("per_user", RateLimitKey::PerUser),
            ("global", RateLimitKey::Global),
        ] {
            let json = format!(
                r#"{{ "action": "rate_limit", "window": "1m", "max_requests": 10, "key": "{}" }}"#,
                key_str
            );
            let action: Action = serde_json::from_str(&json).unwrap();
            match action {
                Action::RateLimit { key, .. } => assert_eq!(
                    std::mem::discriminant(&key),
                    std::mem::discriminant(&expected),
                    "Key mismatch for {}",
                    key_str
                ),
                _ => panic!("Expected RateLimit for key={}", key_str),
            }
        }
    }

    #[test]
    fn test_deserialize_throttle_action() {
        let json = r#"{ "action": "throttle", "delay_ms": 2000 }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Throttle { delay_ms } => assert_eq!(delay_ms, 2000),
            _ => panic!("Expected Throttle"),
        }
    }

    #[test]
    fn test_deserialize_override_multiple_fields() {
        let json = r#"{
            "action": "override",
            "set_body_fields": {
                "model": "gpt-3.5-turbo",
                "max_tokens": 512,
                "temperature": 0.5
            }
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Override { set_body_fields } => {
                assert_eq!(set_body_fields.len(), 3);
                assert_eq!(set_body_fields["model"], "gpt-3.5-turbo");
                assert_eq!(set_body_fields["max_tokens"], 512);
                assert_eq!(set_body_fields["temperature"], 0.5);
            }
            _ => panic!("Expected Override"),
        }
    }

    #[test]
    fn test_deserialize_log_action() {
        let json = r#"{ "action": "log", "level": "error" }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Log { level, tags } => {
                assert_eq!(level, "error");
                assert!(tags.is_empty()); // default
            }
            _ => panic!("Expected Log"),
        }
    }

    #[test]
    fn test_deserialize_log_with_tags() {
        let json = r#"{ "action": "log", "level": "info", "tags": {"env": "prod", "team": "ml"} }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Log { tags, .. } => {
                assert_eq!(tags.get("env").unwrap(), "prod");
                assert_eq!(tags.get("team").unwrap(), "ml");
            }
            _ => panic!("Expected Log"),
        }
    }

    #[test]
    fn test_deserialize_tag_action() {
        let json = r#"{ "action": "tag", "key": "risk", "value": "high" }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Tag { key, value } => {
                assert_eq!(key, "risk");
                assert_eq!(value, "high");
            }
            _ => panic!("Expected Tag"),
        }
    }

    #[test]
    fn test_deserialize_webhook_action() {
        let json = r#"{
            "action": "webhook",
            "url": "https://hooks.example.com/alert",
            "timeout_ms": 5000
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Webhook { url, timeout_ms, .. } => {
                assert_eq!(url, "https://hooks.example.com/alert");
                assert_eq!(timeout_ms, 5000);
            }
            _ => panic!("Expected Webhook"),
        }
    }

    #[test]
    fn test_deserialize_redact_action() {
        let json = r#"{
            "action": "redact",
            "direction": "request",
            "patterns": ["ssn", "email"]
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Redact { direction, patterns, .. } => {
                assert!(matches!(direction, RedactDirection::Request));
                assert_eq!(patterns.len(), 2);
            }
            _ => panic!("Expected Redact"),
        }
    }

    #[test]
    fn test_deserialize_transform_action() {
        let json = r#"{
            "action": "transform",
            "operations": [
                {"type": "set_header", "name": "X-Custom", "value": "true"},
                {"type": "append_system_prompt", "text": "Be safe"}
            ]
        }"#;
        let action: Action = serde_json::from_str(json).unwrap();
        match action {
            Action::Transform { operations } => {
                assert_eq!(operations.len(), 2);
                assert!(matches!(&operations[0], TransformOp::SetHeader { .. }));
                assert!(matches!(&operations[1], TransformOp::AppendSystemPrompt { .. }));
            }
            _ => panic!("Expected Transform"),
        }
    }

    // ── Deserialization: Conditions ───────────────────────────

    #[test]
    fn test_deserialize_check_condition() {
        let json = r#"{ "field": "request.method", "op": "eq", "value": "POST" }"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        match cond {
            Condition::Check { field, op, value } => {
                assert_eq!(field, "request.method");
                assert!(matches!(op, Operator::Eq));
                assert_eq!(value, "POST");
            }
            _ => panic!("Expected Check"),
        }
    }

    #[test]
    fn test_deserialize_always_condition() {
        let json = r#"{ "always": true }"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        match cond {
            Condition::Always { always } => assert!(always),
            _ => panic!("Expected Always"),
        }
    }

    #[test]
    fn test_deserialize_not_condition() {
        let json = r#"{
            "not": { "field": "request.method", "op": "eq", "value": "GET" }
        }"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        match cond {
            Condition::Not { not } => {
                assert!(matches!(*not, Condition::Check { .. }));
            }
            _ => panic!("Expected Not"),
        }
    }

    #[test]
    fn test_deserialize_nested_any_all() {
        let json = r#"{
            "any": [
                { "field": "request.method", "op": "eq", "value": "DELETE" },
                {
                    "all": [
                        { "field": "request.path", "op": "glob", "value": "/v1/charges*" },
                        { "field": "request.body.amount", "op": "gt", "value": 5000 }
                    ]
                }
            ]
        }"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        if let Condition::Any { any } = cond {
            assert_eq!(any.len(), 2);
            assert!(matches!(any[1], Condition::All { .. }));
        } else {
            panic!("Expected Any");
        }
    }

    // ── Deserialization: All Operators ────────────────────────

    #[test]
    fn test_deserialize_all_operators() {
        let operators = vec![
            ("eq", "Eq"), ("neq", "Neq"), ("gt", "Gt"), ("gte", "Gte"),
            ("lt", "Lt"), ("lte", "Lte"), ("in", "In"), ("glob", "Glob"),
            ("regex", "Regex"), ("contains", "Contains"), ("exists", "Exists"),
            ("starts_with", "StartsWith"), ("ends_with", "EndsWith"),
        ];
        for (op_str, _label) in operators {
            let json = format!(
                r#"{{ "field": "request.method", "op": "{}", "value": "test" }}"#,
                op_str
            );
            let result: Result<Condition, _> = serde_json::from_str(&json);
            assert!(result.is_ok(), "Failed to deserialize operator: {}", op_str);
        }
    }

    // ── Deserialization: Policy-level ─────────────────────────

    #[test]
    fn test_policy_defaults() {
        // phase defaults to "pre", mode defaults based on explicit field
        let json = r#"{
            "id": "00000000-0000-0000-0000-000000000001",
            "name": "minimal",
            "mode": "enforce",
            "rules": []
        }"#;
        let policy: Policy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.phase, Phase::Pre);
        assert_eq!(policy.mode, PolicyMode::Enforce);
        assert!(policy.rules.is_empty());
    }

    #[test]
    fn test_policy_post_phase() {
        let json = r#"{
            "id": "00000000-0000-0000-0000-000000000003",
            "name": "response-checker",
            "phase": "post",
            "mode": "enforce",
            "rules": [{
                "when": { "field": "response.status", "op": "gte", "value": 500 },
                "then": { "action": "log", "level": "error" }
            }]
        }"#;
        let policy: Policy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.phase, Phase::Post);
    }

    #[test]
    fn test_policy_single_action_desugars_to_vec() {
        // "then" can be a single action or an array
        let json = r#"{
            "id": "00000000-0000-0000-0000-000000000004",
            "name": "single",
            "mode": "enforce",
            "rules": [{
                "when": { "always": true },
                "then": { "action": "deny", "message": "nope" }
            }]
        }"#;
        let policy: Policy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.rules[0].then.len(), 1);
    }

    #[test]
    fn test_policy_multiple_rules() {
        let json = r#"{
            "id": "00000000-0000-0000-0000-000000000005",
            "name": "multi-rule",
            "mode": "enforce",
            "rules": [
                {
                    "when": { "field": "request.method", "op": "eq", "value": "DELETE" },
                    "then": { "action": "deny", "message": "deletes blocked" }
                },
                {
                    "when": { "field": "request.body.model", "op": "eq", "value": "gpt-4" },
                    "then": { "action": "rate_limit", "window": "1m", "max_requests": 5 }
                },
                {
                    "when": { "always": true },
                    "then": { "action": "log", "level": "info" }
                }
            ]
        }"#;
        let policy: Policy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.rules.len(), 3);
        assert!(matches!(policy.rules[0].then[0], Action::Deny { .. }));
        assert!(matches!(policy.rules[1].then[0], Action::RateLimit { .. }));
        assert!(matches!(policy.rules[2].then[0], Action::Log { .. }));
    }

    // ── Full Scenario: Stripe HITL policy ────────────────────

    #[test]
    fn test_full_stripe_hitl_policy_deserialization() {
        let json = r##"{
            "id": "00000000-0000-0000-0000-000000000010",
            "name": "stripe-high-value-approval",
            "phase": "pre",
            "mode": "enforce",
            "rules": [{
                "when": {
                    "all": [
                        { "field": "request.path", "op": "glob", "value": "/v1/charges*" },
                        { "field": "request.method", "op": "eq", "value": "POST" },
                        { "field": "request.body.amount", "op": "gt", "value": 5000 }
                    ]
                },
                "then": [
                    { "action": "require_approval", "timeout": "30m", "fallback": "deny",
                      "notify": { "type": "slack", "channel": "#payments-review" }},
                    { "action": "tag", "key": "risk", "value": "high" }
                ]
            }]
        }"##;
        let policy: Policy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.name, "stripe-high-value-approval");
        assert_eq!(policy.phase, Phase::Pre);
        assert_eq!(policy.mode, PolicyMode::Enforce);
        assert_eq!(policy.rules.len(), 1);

        let rule = &policy.rules[0];
        assert!(matches!(rule.when, Condition::All { .. }));
        assert_eq!(rule.then.len(), 2);
        assert!(matches!(rule.then[0], Action::RequireApproval { .. }));
        assert!(matches!(rule.then[1], Action::Tag { .. }));
    }

    // ── Full Scenario: Model governance policy ───────────────

    #[test]
    fn test_full_model_governance_deserialization() {
        let json = r#"{
            "id": "00000000-0000-0000-0000-000000000011",
            "name": "expensive-model-governance",
            "mode": "enforce",
            "rules": [
                {
                    "when": { "field": "request.body.model", "op": "in", "value": ["gpt-4", "gpt-4-turbo"] },
                    "then": { "action": "rate_limit", "window": "1m", "max_requests": 10, "key": "per_token" }
                },
                {
                    "when": {
                        "all": [
                            { "field": "request.body.model", "op": "eq", "value": "gpt-4" },
                            { "field": "usage.spend_today_usd", "op": "gt", "value": 50.0 }
                        ]
                    },
                    "then": { "action": "override", "set_body_fields": { "model": "gpt-3.5-turbo" } }
                }
            ]
        }"#;
        let policy: Policy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.rules.len(), 2);

        // First rule: rate limit for expensive models
        match &policy.rules[0].then[0] {
            Action::RateLimit { window, max_requests, key } => {
                assert_eq!(window, "1m");
                assert_eq!(*max_requests, 10);
                assert!(matches!(key, RateLimitKey::PerToken));
            }
            _ => panic!("Expected RateLimit"),
        }

        // Second rule: override to cheaper model
        match &policy.rules[1].then[0] {
            Action::Override { set_body_fields } => {
                assert_eq!(set_body_fields["model"], "gpt-3.5-turbo");
            }
            _ => panic!("Expected Override"),
        }
    }
}
