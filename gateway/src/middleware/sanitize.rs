use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

// Regex patterns for PII detection
static EMAIL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}").unwrap());

static CREDIT_CARD_REGEX: Lazy<Regex> = Lazy::new(|| {
    // Basic Luhn-like pattern (13-19 digits, optional spaces/dashes)
    // Note: This is a loose approximation for MVP.
    Regex::new(r"\b(?:\d[ -]*?){13,19}\b").unwrap()
});

static SSN_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap());

static API_KEY_REGEX: Lazy<Regex> = Lazy::new(|| {
    // Matches common sk- patterns (OpenAI, Stripe, etc)
    Regex::new(r"(?i)\b(sk-[a-zA-Z0-9_\-\.]{20,})\b").unwrap()
});

use std::collections::HashSet;

/// Result of sanitization.
pub struct SanitizationResult {
    pub body: Vec<u8>,
    pub redacted_types: Vec<String>,
}

/// Sanitize the accumulated content from a completed SSE stream.
///
/// Operates on the full assembled text (not individual chunks), which solves
/// the split-PII problem where a pattern like "user@example.com" could be
/// split across two SSE chunks and missed by per-chunk sanitization.
///
/// This is called on the audit log copy — the in-flight stream is forwarded
/// as-is to minimize latency.
pub fn sanitize_stream_content(content: &str) -> SanitizationResult {
    let mut redacted = HashSet::new();
    let sanitized = sanitize_text(content, &mut redacted);
    SanitizationResult {
        body: sanitized.into_bytes(),
        redacted_types: redacted.into_iter().collect(),
    }
}

/// Streaming-aware response sanitization.
///
/// Strategy:
/// - JSON: Recursively walk and sanitize string values.
/// - Text: Regex replacement on full body.
/// - Binary: Pass-through.
pub fn sanitize_response(body: &[u8], content_type: &str) -> SanitizationResult {
    let mut redacted = HashSet::new();

    // 1. JSON handling
    if content_type.contains("application/json") {
        if let Ok(mut value) = serde_json::from_slice::<Value>(body) {
            sanitize_json_value(&mut value, &mut redacted);
            if let Ok(sanitized) = serde_json::to_vec(&value) {
                return SanitizationResult {
                    body: sanitized,
                    redacted_types: redacted.into_iter().collect(),
                };
            }
        }
    }

    // 2. Text (or failed JSON) handling
    if let Ok(text) = std::str::from_utf8(body) {
        let sanitized = sanitize_text(text, &mut redacted);
        return SanitizationResult {
            body: sanitized.into_bytes(),
            redacted_types: redacted.into_iter().collect(),
        };
    }

    // 3. Binary pass-through
    SanitizationResult {
        body: body.to_vec(),
        redacted_types: vec![],
    }
}

fn sanitize_json_value(v: &mut Value, redacted: &mut HashSet<String>) {
    match v {
        Value::String(s) => *s = sanitize_text(s, redacted),
        Value::Array(arr) => {
            for i in arr {
                sanitize_json_value(i, redacted);
            }
        }
        Value::Object(obj) => {
            for (_, val) in obj {
                sanitize_json_value(val, redacted);
            }
        }
        _ => {}
    }
}

fn sanitize_text(s: &str, redacted: &mut HashSet<String>) -> String {
    let mut s = s.to_string();

    if EMAIL_REGEX.is_match(&s) {
        s = EMAIL_REGEX.replace_all(&s, "[REDACTED_EMAIL]").to_string();
        redacted.insert("email".to_string());
    }
    if CREDIT_CARD_REGEX.is_match(&s) {
        s = CREDIT_CARD_REGEX
            .replace_all(&s, "[REDACTED_CC]")
            .to_string();
        redacted.insert("credit_card".to_string());
    }
    if SSN_REGEX.is_match(&s) {
        s = SSN_REGEX.replace_all(&s, "[REDACTED_SSN]").to_string();
        redacted.insert("ssn".to_string());
    }
    if API_KEY_REGEX.is_match(&s) {
        s = API_KEY_REGEX
            .replace_all(&s, "[REDACTED_API_KEY]")
            .to_string();
        redacted.insert("api_key".to_string());
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_email() {
        let input = "Contact us at support@ailink.dev for help.";
        let res = sanitize_response(input.as_bytes(), "text/plain");
        assert_eq!(
            String::from_utf8(res.body).unwrap(),
            "Contact us at [REDACTED_EMAIL] for help."
        );
        assert!(res.redacted_types.contains(&"email".to_string()));
    }

    #[test]
    fn test_sanitize_json() {
        let json = serde_json::json!({
            "user": {
                "email": "user@example.com",
                "id": 123
            },
            "api_key": "sk-1234567890abcdef1234567890abcdef"
        });
        let body = serde_json::to_vec(&json).unwrap();
        let res = sanitize_response(&body, "application/json");
        let sanitized_json: Value = serde_json::from_slice(&res.body).unwrap();

        assert_eq!(sanitized_json["user"]["email"], "[REDACTED_EMAIL]");
        assert_eq!(sanitized_json["api_key"], "[REDACTED_API_KEY]");
        assert!(res.redacted_types.contains(&"email".to_string()));
        assert!(res.redacted_types.contains(&"api_key".to_string()));
    }

    #[test]
    fn test_sanitize_cc() {
        let input = "Payment: 4111 1111 1111 1111"; // Vista valid-ish
        let res = sanitize_response(input.as_bytes(), "text/plain");
        assert_eq!(
            String::from_utf8(res.body).unwrap(),
            "Payment: [REDACTED_CC]"
        );
        assert!(res.redacted_types.contains(&"credit_card".to_string()));
    }
}
