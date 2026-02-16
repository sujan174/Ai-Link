//! Policy evaluation facade.
//!
//! This module bridges the legacy handler interface with the new condition→action
//! engine. The proxy handler calls `evaluate_pre_flight()` and `evaluate_post_flight()`
//! and executes the returned actions.

use crate::cache::TieredCache;
use crate::models::policy::{Action, EvalOutcome, Phase, Policy, RateLimitKey, TriggeredAction};
use crate::errors::AppError;

use super::engine;
use super::fields::RequestContext;

// ── Pre-flight evaluation (before upstream) ──────────────────

/// Evaluate all pre-flight policies and return the outcome.
///
/// This replaces the old `evaluate_rules()` function. The caller must
/// iterate over `outcome.actions` and execute each one.
pub fn evaluate_pre_flight(policies: &[Policy], ctx: &RequestContext<'_>) -> EvalOutcome {
    engine::evaluate_policies(policies, ctx, &Phase::Pre)
}

// ── Post-flight evaluation (after upstream response) ─────────

/// Evaluate all post-flight policies against the response.
pub fn evaluate_post_flight(policies: &[Policy], ctx: &RequestContext<'_>) -> EvalOutcome {
    engine::evaluate_policies(policies, ctx, &Phase::Post)
}

// ── Action Execution Helpers ─────────────────────────────────

/// Parse a duration string like "1m", "30s", "1h" into seconds.
pub fn parse_window_secs(window: &str) -> Option<u64> {
    let window = window.trim();
    if window.is_empty() {
        return None;
    }

    let (num_str, unit) = window.split_at(window.len() - 1);
    let num: u64 = num_str.parse().ok()?;

    match unit {
        "s" => Some(num),
        "m" => Some(num * 60),
        "h" => Some(num * 3600),
        "d" => Some(num * 86400),
        _ => None,
    }
}

/// Build the rate-limit Redis key for a given action + context.
pub fn rate_limit_key(action: &Action, ctx: &RequestContext<'_>) -> String {
    if let Action::RateLimit { key, .. } = action {
        match key {
            RateLimitKey::PerToken => format!("rl:tok:{}", ctx.token_id),
            RateLimitKey::PerAgent => format!(
                "rl:agent:{}",
                ctx.agent_name.unwrap_or("unknown")
            ),
            RateLimitKey::PerIp => format!(
                "rl:ip:{}",
                ctx.client_ip.unwrap_or("unknown")
            ),
            RateLimitKey::PerUser => format!("rl:user:{}", ctx.token_id), // TODO: JWT sub
            RateLimitKey::Global => "rl:global".to_string(),
        }
    } else {
        format!("rl:tok:{}", ctx.token_id) // fallback
    }
}

/// Execute a rate limit action using the cache.
pub async fn execute_rate_limit(
    action: &Action,
    ctx: &RequestContext<'_>,
    cache: &TieredCache,
) -> Result<(), AppError> {
    if let Action::RateLimit {
        window,
        max_requests,
        ..
    } = action
    {
        let window_secs = parse_window_secs(window).unwrap_or(60);
        let key = rate_limit_key(action, ctx);

        let count = cache
            .increment(&key, window_secs)
            .await
            .map_err(AppError::Internal)?;

        if count > *max_requests {
            tracing::warn!(
                key = %key,
                count = count,
                limit = max_requests,
                "rate limit exceeded"
            );
            return Err(AppError::RateLimitExceeded);
        }
    }
    Ok(())
}

/// Apply body field overrides (e.g., force model downgrade).
pub fn apply_override(body: &mut serde_json::Value, action: &Action) {
    if let Action::Override { set_body_fields } = action {
        if let Some(obj) = body.as_object_mut() {
            for (key, value) in set_body_fields {
                obj.insert(key.clone(), value.clone());
            }
            tracing::info!(
                fields = ?set_body_fields.keys().collect::<Vec<_>>(),
                "applied body overrides"
            );
        }
    }
}

/// Check if any triggered action requires HITL approval.
pub fn requires_approval(outcome: &EvalOutcome) -> Option<&TriggeredAction> {
    outcome
        .actions
        .iter()
        .find(|a| matches!(a.action, Action::RequireApproval { .. }))
}

/// Check if any triggered action is a deny.
pub fn first_deny(outcome: &EvalOutcome) -> Option<&TriggeredAction> {
    outcome
        .actions
        .iter()
        .find(|a| matches!(a.action, Action::Deny { .. }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_window_secs() {
        assert_eq!(parse_window_secs("1s"), Some(1));
        assert_eq!(parse_window_secs("5m"), Some(300));
        assert_eq!(parse_window_secs("2h"), Some(7200));
        assert_eq!(parse_window_secs("1d"), Some(86400));
        assert_eq!(parse_window_secs(""), None);
        assert_eq!(parse_window_secs("abc"), None);
    }
}
