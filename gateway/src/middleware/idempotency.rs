/// Deduplicates HITL approval requests using idempotency keys.
/// If an agent retries a request while the first is pending approval,
/// the retry maps to the existing approval rather than creating a new one.
#[allow(dead_code)]
pub async fn check_idempotency(_idempotency_key: &str) -> Option<String> {
    // TODO: check redis for existing request_id mapped to this key
    None
}
