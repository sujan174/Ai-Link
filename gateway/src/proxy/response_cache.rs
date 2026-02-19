use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::cache::TieredCache;

/// Fields from the request body that form the cache key.
/// We normalize and hash these so identical prompts always hit cache.
const CACHE_KEY_FIELDS: &[&str] = &["model", "messages", "temperature", "max_tokens", "tools", "tool_choice"];

/// Default cache TTL: 5 minutes.
pub const DEFAULT_CACHE_TTL_SECS: u64 = 300;

/// A cached LLM response stored in Redis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedResponse {
    pub status: u16,
    pub body: Vec<u8>,
    pub content_type: String,
    pub model: Option<String>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

/// Compute a deterministic cache key from the relevant request body fields.
/// Returns `None` if the body doesn't contain enough info to cache (e.g., no model).
pub fn compute_cache_key(
    token_id: &str,
    body: &serde_json::Value,
) -> Option<String> {
    let obj = body.as_object()?;

    // Must have at least a model to cache
    obj.get("model")?.as_str()?;

    // Build a canonical JSON object with only the cache-relevant fields
    let mut canonical = serde_json::Map::new();
    for &field in CACHE_KEY_FIELDS {
        if let Some(val) = obj.get(field) {
            canonical.insert(field.to_string(), val.clone());
        }
    }

    // Sort keys for deterministic serialization (serde_json::Map is BTreeMap-backed)
    let canonical_json = serde_json::to_string(&serde_json::Value::Object(canonical))
        .ok()?;

    let mut hasher = Sha256::new();
    hasher.update(token_id.as_bytes());
    hasher.update(b":");
    hasher.update(canonical_json.as_bytes());
    let hash = hex::encode(hasher.finalize());

    Some(format!("llm_cache:{}", hash))
}

/// Attempt to retrieve a cached response.
pub async fn get_cached(cache: &TieredCache, key: &str) -> Option<CachedResponse> {
    cache.get::<CachedResponse>(key).await
}

/// Maximum size of a single cached response (256 KB).
/// Responses larger than this are not cached to prevent Redis memory exhaustion.
const MAX_CACHE_ENTRY_BYTES: usize = 256 * 1024;

/// Store a response in cache with the given TTL.
/// Silently skips caching if the serialized response exceeds MAX_CACHE_ENTRY_BYTES.
pub async fn set_cached(
    cache: &TieredCache,
    key: &str,
    response: &CachedResponse,
    ttl_secs: u64,
) {
    // Serialize first to check size before writing to Redis
    let serialized = match serde_json::to_vec(response) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Failed to serialize cache entry: {}", e);
            return;
        }
    };

    if serialized.len() > MAX_CACHE_ENTRY_BYTES {
        tracing::debug!(
            key = key,
            size_bytes = serialized.len(),
            limit_bytes = MAX_CACHE_ENTRY_BYTES,
            "skipping cache — response exceeds size limit"
        );
        return;
    }

    if let Err(e) = cache.set(key, response, ttl_secs).await {
        tracing::warn!("Failed to cache response: {}", e);
    }
}

/// Check if caching should be skipped for this request.
pub fn should_skip_cache(headers: &axum::http::HeaderMap) -> bool {
    // Explicit opt-out
    if headers
        .get("x-ailink-no-cache")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
    {
        return true;
    }

    // Standard Cache-Control: no-cache / no-store
    if let Some(cc) = headers.get("cache-control").and_then(|v| v.to_str().ok()) {
        let lower = cc.to_lowercase();
        if lower.contains("no-cache") || lower.contains("no-store") {
            return true;
        }
    }

    false
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_deterministic() {
        let body = serde_json::json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}],
            "temperature": 0.7
        });
        let key1 = compute_cache_key("tok_123", &body).unwrap();
        let key2 = compute_cache_key("tok_123", &body).unwrap();
        assert_eq!(key1, key2);
        assert!(key1.starts_with("llm_cache:"));
    }

    #[test]
    fn test_cache_key_differs_by_token() {
        let body = serde_json::json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        let key1 = compute_cache_key("tok_a", &body).unwrap();
        let key2 = compute_cache_key("tok_b", &body).unwrap();
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_cache_key_differs_by_content() {
        let body1 = serde_json::json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        let body2 = serde_json::json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "world"}]
        });
        let key1 = compute_cache_key("tok_123", &body1).unwrap();
        let key2 = compute_cache_key("tok_123", &body2).unwrap();
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_cache_key_ignores_irrelevant_fields() {
        let body1 = serde_json::json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": true  // not in CACHE_KEY_FIELDS
        });
        let body2 = serde_json::json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": false
        });
        let key1 = compute_cache_key("tok_123", &body1).unwrap();
        let key2 = compute_cache_key("tok_123", &body2).unwrap();
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_cache_key_none_without_model() {
        let body = serde_json::json!({
            "messages": [{"role": "user", "content": "hello"}]
        });
        assert!(compute_cache_key("tok_123", &body).is_none());
    }

    #[test]
    fn test_should_skip_cache_header() {
        let mut headers = axum::http::HeaderMap::new();
        assert!(!should_skip_cache(&headers));

        headers.insert("x-ailink-no-cache", "true".parse().unwrap());
        assert!(should_skip_cache(&headers));
    }

    #[test]
    fn test_should_skip_cache_control() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("cache-control", "no-cache".parse().unwrap());
        assert!(should_skip_cache(&headers));

        let mut headers2 = axum::http::HeaderMap::new();
        headers2.insert("cache-control", "no-store".parse().unwrap());
        assert!(should_skip_cache(&headers2));
    }
}
