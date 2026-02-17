//! Policy-driven redaction and transformation.
//!
//! Implements `Action::Redact` (pattern-based PII scrubbing) and
//! `Action::Transform` (header/body mutations) for the condition→action engine.

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use crate::models::policy::{Action, RedactDirection, TransformOp};

// ── Built-in PII patterns ────────────────────────────────────

/// Registry of named patterns. Policy authors can reference these by name
/// in the `patterns` array (e.g., `"patterns": ["ssn", "email"]`).
struct BuiltinPattern {
    name: &'static str,
    regex: &'static Lazy<Regex>,
    replacement: &'static str,
}

static EMAIL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}").unwrap());

static SSN_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap());

static CREDIT_CARD_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(?:\d[ -]*?){13,19}\b").unwrap());

static API_KEY_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(sk-[a-zA-Z0-9_\-\.]{20,})\b").unwrap());

static PHONE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b").unwrap());

const BUILTIN_PATTERNS: &[BuiltinPattern] = &[
    BuiltinPattern {
        name: "email",
        regex: &EMAIL_RE,
        replacement: "[REDACTED_EMAIL]",
    },
    BuiltinPattern {
        name: "ssn",
        regex: &SSN_RE,
        replacement: "[REDACTED_SSN]",
    },
    BuiltinPattern {
        name: "credit_card",
        regex: &CREDIT_CARD_RE,
        replacement: "[REDACTED_CC]",
    },
    BuiltinPattern {
        name: "api_key",
        regex: &API_KEY_RE,
        replacement: "[REDACTED_API_KEY]",
    },
    BuiltinPattern {
        name: "phone",
        regex: &PHONE_RE,
        replacement: "[REDACTED_PHONE]",
    },
];

// ── Redact ───────────────────────────────────────────────────

/// Apply policy-driven redaction to a JSON body.
///
/// Supports two modes:
/// - **Pattern-based**: Named patterns (`ssn`, `email`) or custom regex strings.
/// - **Field-based**: Blanks specific JSON keys listed in `fields`.
///
/// Returns the list of pattern names that matched (for audit logging).
pub fn apply_redact(body: &mut Value, action: &Action, is_request: bool) -> Vec<String> {
    let (direction, patterns, fields) = match action {
        Action::Redact {
            direction,
            patterns,
            fields,
        } => (direction, patterns, fields),
        _ => return vec![],
    };

    // Direction check: should we redact in this phase?
    let should_run = match direction {
        RedactDirection::Request => is_request,
        RedactDirection::Response => !is_request,
        RedactDirection::Both => true,
    };

    if !should_run {
        return vec![];
    }

    let mut matched = Vec::new();

    // 1. Pattern-based redaction (walk all string values)
    if !patterns.is_empty() {
        let compiled = compile_patterns(patterns);
        redact_value(body, &compiled, &mut matched);
    }

    // 2. Field-based redaction (blank named keys)
    if !fields.is_empty() {
        redact_fields(body, fields, &mut matched);
    }

    matched
}

/// Compile pattern names into (regex, replacement, name) tuples.
/// If a pattern name matches a built-in, use that; otherwise treat it as raw regex.
fn compile_patterns(patterns: &[String]) -> Vec<(Regex, String, String)> {
    patterns
        .iter()
        .filter_map(|p| {
            // Check built-in patterns first
            if let Some(builtin) = BUILTIN_PATTERNS.iter().find(|b| b.name == p) {
                // Clone the inner Regex from the Lazy
                let re: &Regex = builtin.regex;
                return Some((re.clone(), builtin.replacement.to_string(), p.clone()));
            }
            // Try compiling as custom regex
            Regex::new(p)
                .ok()
                .map(|re| (re, format!("[REDACTED_{}]", p.to_uppercase()), p.clone()))
        })
        .collect()
}

/// Recursively walk a JSON value and apply pattern-based redaction to strings.
fn redact_value(v: &mut Value, patterns: &[(Regex, String, String)], matched: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            for (re, replacement, name) in patterns {
                if re.is_match(s) {
                    *s = re.replace_all(s, replacement.as_str()).to_string();
                    if !matched.contains(name) {
                        matched.push(name.clone());
                    }
                }
            }
        }
        Value::Array(arr) => {
            for item in arr {
                redact_value(item, patterns, matched);
            }
        }
        Value::Object(obj) => {
            for (_, val) in obj {
                redact_value(val, patterns, matched);
            }
        }
        _ => {}
    }
}

/// Blank specific JSON fields by name (recursive).
fn redact_fields(v: &mut Value, fields: &[String], matched: &mut Vec<String>) {
    if let Some(obj) = v.as_object_mut() {
        for field_name in fields {
            if obj.contains_key(field_name) {
                obj.insert(field_name.clone(), Value::String("[REDACTED]".to_string()));
                let tag = format!("field:{}", field_name);
                if !matched.contains(&tag) {
                    matched.push(tag);
                }
            }
        }
        // Recurse into nested objects and arrays
        for (_, val) in obj {
            redact_fields(val, fields, matched);
        }
    } else if let Some(arr) = v.as_array_mut() {
        for item in arr {
            redact_fields(item, fields, matched);
        }
    }
}

// ── Transform ────────────────────────────────────────────────

/// Collected header mutations from Transform actions.
/// Applied after the pre-flight loop completes.
#[derive(Debug, Default)]
pub struct HeaderMutations {
    pub inserts: Vec<(String, String)>,
    pub removals: Vec<String>,
}

/// Apply collected header mutations to a header map.
#[allow(dead_code)]
pub fn apply_header_mutations(headers: &mut hyper::HeaderMap, mutations: &HeaderMutations) {
    for name in &mutations.removals {
        if let Ok(key) = hyper::header::HeaderName::from_bytes(name.as_bytes()) {
            headers.remove(&key);
        }
    }
    for (name, value) in &mutations.inserts {
        if let (Ok(key), Ok(val)) = (
            hyper::header::HeaderName::from_bytes(name.as_bytes()),
            hyper::header::HeaderValue::from_str(value),
        ) {
            headers.insert(key, val);
        }
    }
}

/// Apply a single transform operation.
///
/// - `SetHeader`/`RemoveHeader` → collected into `HeaderMutations` for deferred application
/// - `AppendSystemPrompt` → modifies the body in-place (OpenAI messages format)
pub fn apply_transform(body: &mut Value, header_mutations: &mut HeaderMutations, op: &TransformOp) {
    match op {
        TransformOp::SetHeader { name, value } => {
            tracing::info!(header = %name, "transform: set header");
            header_mutations.inserts.push((name.clone(), value.clone()));
        }
        TransformOp::RemoveHeader { name } => {
            tracing::info!(header = %name, "transform: remove header");
            header_mutations.removals.push(name.clone());
        }
        TransformOp::AppendSystemPrompt { text } => {
            tracing::info!("transform: append system prompt");
            append_system_prompt(body, text);
        }
    }
}

// ── Logging Redaction ────────────────────────────────────────

/// Redact all known PII patterns from a JSON value for safe storage (Level 1 logging).
/// Applies every built-in pattern (SSN, email, credit card, API key, phone) and returns
/// the serialised JSON string, or None if input is None.
pub fn redact_for_logging(body: &Option<serde_json::Value>) -> Option<String> {
    let body = body.as_ref()?;
    let mut clone = body.clone();
    redact_all_patterns(&mut clone);
    Some(serde_json::to_string(&clone).unwrap_or_default())
}

/// Apply every built-in PII pattern to all string values in a JSON tree.
fn redact_all_patterns(v: &mut Value) {
    match v {
        Value::String(s) => {
            for pat in BUILTIN_PATTERNS {
                let re: &Regex = pat.regex;
                if re.is_match(s) {
                    *s = re.replace_all(s, pat.replacement).to_string();
                }
            }
        }
        Value::Array(arr) => {
            for item in arr {
                redact_all_patterns(item);
            }
        }
        Value::Object(obj) => {
            for (_, val) in obj {
                redact_all_patterns(val);
            }
        }
        _ => {}
    }
}

/// Append a system message to an OpenAI-format messages array.
fn append_system_prompt(body: &mut Value, text: &str) {
    if let Some(messages) = body.get_mut("messages").and_then(|m| m.as_array_mut()) {
        messages.push(serde_json::json!({
            "role": "system",
            "content": text
        }));
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::HeaderMap;
    use serde_json::json;

    // ── Pattern-based Redaction ──────────────────────────────

    #[test]
    fn test_redact_email_pattern() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec!["email".to_string()],
            fields: vec![],
        };
        let mut body = json!({"user": {"email": "alice@example.com", "name": "Alice"}});
        let matched = apply_redact(&mut body, &action, true);

        assert_eq!(body["user"]["email"], "[REDACTED_EMAIL]");
        assert_eq!(body["user"]["name"], "Alice"); // untouched
        assert!(matched.contains(&"email".to_string()));
    }

    #[test]
    fn test_redact_ssn_pattern() {
        let action = Action::Redact {
            direction: RedactDirection::Both,
            patterns: vec!["ssn".to_string()],
            fields: vec![],
        };
        let mut body = json!({"data": "My SSN is 123-45-6789"});
        let matched = apply_redact(&mut body, &action, true);

        assert_eq!(body["data"], "My SSN is [REDACTED_SSN]");
        assert!(matched.contains(&"ssn".to_string()));
    }

    #[test]
    fn test_redact_multiple_patterns() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec!["email".to_string(), "api_key".to_string()],
            fields: vec![],
        };
        let mut body = json!({
            "from": "user@test.com",
            "key": "sk-abcdefghijklmnopqrstuvwxyz1234"
        });
        let matched = apply_redact(&mut body, &action, true);

        assert_eq!(body["from"], "[REDACTED_EMAIL]");
        assert_eq!(body["key"], "[REDACTED_API_KEY]");
        assert_eq!(matched.len(), 2);
    }

    #[test]
    fn test_redact_custom_regex_pattern() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec![r"\b[A-Z]{2}\d{6}\b".to_string()], // passport-like
            fields: vec![],
        };
        let mut body = json!({"passport": "AB123456"});
        let matched = apply_redact(&mut body, &action, true);

        assert!(body["passport"].as_str().unwrap().contains("[REDACTED_"));
        assert_eq!(matched.len(), 1);
    }

    #[test]
    fn test_redact_nested_arrays() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec!["email".to_string()],
            fields: vec![],
        };
        let mut body = json!({
            "users": [
                {"email": "a@b.com"},
                {"email": "c@d.com"}
            ]
        });
        let matched = apply_redact(&mut body, &action, true);

        assert_eq!(body["users"][0]["email"], "[REDACTED_EMAIL]");
        assert_eq!(body["users"][1]["email"], "[REDACTED_EMAIL]");
        assert_eq!(matched.len(), 1); // deduplicated
    }

    // ── Field-based Redaction ────────────────────────────────

    #[test]
    fn test_redact_named_fields() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec![],
            fields: vec!["password".to_string(), "secret".to_string()],
        };
        let mut body = json!({
            "user": "alice",
            "password": "hunter2",
            "secret": "s3cr3t"
        });
        let matched = apply_redact(&mut body, &action, true);

        assert_eq!(body["password"], "[REDACTED]");
        assert_eq!(body["secret"], "[REDACTED]");
        assert_eq!(body["user"], "alice");
        assert!(matched.contains(&"field:password".to_string()));
    }

    #[test]
    fn test_redact_fields_nested() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec![],
            fields: vec!["token".to_string()],
        };
        let mut body = json!({
            "auth": {"token": "xyz"},
            "data": {"nested": {"token": "abc"}}
        });
        apply_redact(&mut body, &action, true);

        assert_eq!(body["auth"]["token"], "[REDACTED]");
        assert_eq!(body["data"]["nested"]["token"], "[REDACTED]");
    }

    // ── Direction Filtering ──────────────────────────────────

    #[test]
    fn test_redact_direction_request_only() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec!["email".to_string()],
            fields: vec![],
        };
        let mut body = json!({"email": "a@b.com"});

        // Should run on request
        let matched = apply_redact(&mut body, &action, true);
        assert_eq!(matched.len(), 1);

        // Should NOT run on response
        let mut body2 = json!({"email": "a@b.com"});
        let matched2 = apply_redact(&mut body2, &action, false);
        assert!(matched2.is_empty());
        assert_eq!(body2["email"], "a@b.com"); // untouched
    }

    #[test]
    fn test_redact_direction_response_only() {
        let action = Action::Redact {
            direction: RedactDirection::Response,
            patterns: vec!["ssn".to_string()],
            fields: vec![],
        };
        let mut body = json!({"data": "SSN: 123-45-6789"});

        // Should NOT run on request
        let matched = apply_redact(&mut body, &action, true);
        assert!(matched.is_empty());

        // Should run on response
        let matched2 = apply_redact(&mut body, &action, false);
        assert_eq!(matched2.len(), 1);
    }

    #[test]
    fn test_redact_direction_both() {
        let action = Action::Redact {
            direction: RedactDirection::Both,
            patterns: vec!["email".to_string()],
            fields: vec![],
        };
        let mut body_req = json!({"email": "a@b.com"});
        let mut body_resp = json!({"email": "c@d.com"});

        assert_eq!(apply_redact(&mut body_req, &action, true).len(), 1);
        assert_eq!(apply_redact(&mut body_resp, &action, false).len(), 1);
    }

    // ── Transform: AppendSystemPrompt ────────────────────────

    #[test]
    fn test_transform_append_system_prompt() {
        let mut body = json!({
            "model": "gpt-4",
            "messages": [
                {"role": "user", "content": "Hello"}
            ]
        });
        let mut mutations = HeaderMutations::default();
        let op = TransformOp::AppendSystemPrompt {
            text: "Always be helpful and safe.".to_string(),
        };

        apply_transform(&mut body, &mut mutations, &op);

        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[1]["role"], "system");
        assert_eq!(messages[1]["content"], "Always be helpful and safe.");
    }

    #[test]
    fn test_transform_append_no_messages_key() {
        let mut body = json!({"model": "gpt-4"});
        let mut mutations = HeaderMutations::default();
        let op = TransformOp::AppendSystemPrompt {
            text: "Be safe.".to_string(),
        };

        apply_transform(&mut body, &mut mutations, &op);

        // No messages array → no change
        assert!(body.get("messages").is_none());
    }

    // ── Transform: Headers ───────────────────────────────────

    #[test]
    fn test_transform_set_header() {
        let mut body = json!({});
        let mut mutations = HeaderMutations::default();

        apply_transform(
            &mut body,
            &mut mutations,
            &TransformOp::SetHeader {
                name: "X-Custom".to_string(),
                value: "true".to_string(),
            },
        );

        assert_eq!(mutations.inserts.len(), 1);
        assert_eq!(
            mutations.inserts[0],
            ("X-Custom".to_string(), "true".to_string())
        );
    }

    #[test]
    fn test_transform_remove_header() {
        let mut body = json!({});
        let mut mutations = HeaderMutations::default();

        apply_transform(
            &mut body,
            &mut mutations,
            &TransformOp::RemoveHeader {
                name: "Authorization".to_string(),
            },
        );

        assert_eq!(mutations.removals.len(), 1);
        assert_eq!(mutations.removals[0], "Authorization");
    }

    #[test]
    fn test_apply_header_mutations() {
        let mut headers = HeaderMap::new();
        headers.insert("x-old", "remove-me".parse().unwrap());
        headers.insert("x-keep", "keep-me".parse().unwrap());

        let mutations = HeaderMutations {
            inserts: vec![("x-new".to_string(), "added".to_string())],
            removals: vec!["x-old".to_string()],
        };

        apply_header_mutations(&mut headers, &mutations);

        assert!(headers.get("x-old").is_none());
        assert_eq!(headers.get("x-new").unwrap(), "added");
        assert_eq!(headers.get("x-keep").unwrap(), "keep-me");
    }

    // ── No-op cases ──────────────────────────────────────────

    #[test]
    fn test_redact_no_patterns_no_fields() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec![],
            fields: vec![],
        };
        let mut body = json!({"email": "a@b.com"});
        let matched = apply_redact(&mut body, &action, true);

        assert!(matched.is_empty());
        assert_eq!(body["email"], "a@b.com"); // untouched
    }

    #[test]
    fn test_redact_wrong_action_type() {
        let action = Action::Deny {
            status: 403,
            message: "no".to_string(),
        };
        let mut body = json!({"data": "test"});
        let matched = apply_redact(&mut body, &action, true);
        assert!(matched.is_empty());
    }

    #[test]
    fn test_redact_phone_pattern() {
        let action = Action::Redact {
            direction: RedactDirection::Request,
            patterns: vec!["phone".to_string()],
            fields: vec![],
        };
        let mut body = json!({"contact": "Call me at 555-123-4567"});
        let matched = apply_redact(&mut body, &action, true);

        assert!(body["contact"]
            .as_str()
            .unwrap()
            .contains("[REDACTED_PHONE]"));
        assert!(matched.contains(&"phone".to_string()));
    }
}
