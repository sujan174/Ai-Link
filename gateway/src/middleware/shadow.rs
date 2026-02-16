/// Shadow mode: when a policy is set to mode=shadow,
/// violations are logged as `shadow_deny` events but the request proceeds.
///
/// This lets teams validate policies against live traffic before enforcing.
pub fn log_shadow_violation(policy_name: &str, rule_type: &str, reason: &str) {
    tracing::warn!(
        shadow = true,
        policy = policy_name,
        rule = rule_type,
        reason = reason,
        "shadow mode: request would have been denied"
    );
}
