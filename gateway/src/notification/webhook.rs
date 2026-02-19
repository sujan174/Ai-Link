use anyhow::Result;
use serde::Serialize;
use std::time::Duration;
use tracing::{info, warn};

// ── Webhook Event Types ───────────────────────────────────────

/// A structured event payload sent to webhook endpoints.
#[derive(Debug, Clone, Serialize)]
pub struct WebhookEvent {
    /// Event type identifier, e.g. "policy_violation", "rate_limit_exceeded", "spend_cap_exceeded".
    pub event_type: String,
    /// ISO-8601 timestamp of when the event occurred.
    pub timestamp: String,
    /// The token that triggered the event.
    pub token_id: String,
    /// Human-readable token name.
    pub token_name: String,
    /// Project ID the token belongs to.
    pub project_id: String,
    /// Event-specific details (policy name, reason, limits, etc.).
    pub details: serde_json::Value,
}

impl WebhookEvent {
    pub fn policy_violation(
        token_id: &str,
        token_name: &str,
        project_id: &str,
        policy_name: &str,
        reason: &str,
    ) -> Self {
        Self {
            event_type: "policy_violation".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            token_id: token_id.to_string(),
            token_name: token_name.to_string(),
            project_id: project_id.to_string(),
            details: serde_json::json!({
                "policy": policy_name,
                "reason": reason,
            }),
        }
    }

    pub fn rate_limit_exceeded(
        token_id: &str,
        token_name: &str,
        project_id: &str,
        policy_name: &str,
        max_requests: u64,
        window_secs: u64,
    ) -> Self {
        Self {
            event_type: "rate_limit_exceeded".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            token_id: token_id.to_string(),
            token_name: token_name.to_string(),
            project_id: project_id.to_string(),
            details: serde_json::json!({
                "policy": policy_name,
                "max_requests": max_requests,
                "window_secs": window_secs,
            }),
        }
    }

    pub fn spend_cap_exceeded(
        token_id: &str,
        token_name: &str,
        project_id: &str,
        reason: &str,
    ) -> Self {
        Self {
            event_type: "spend_cap_exceeded".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            token_id: token_id.to_string(),
            token_name: token_name.to_string(),
            project_id: project_id.to_string(),
            details: serde_json::json!({ "reason": reason }),
        }
    }
}

// ── Webhook Notifier ──────────────────────────────────────────

/// Dispatches webhook events to one or more configured URLs.
#[derive(Clone)]
pub struct WebhookNotifier {
    client: reqwest::Client,
}

impl WebhookNotifier {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .user_agent("AILink-Webhook/1.0")
                .build()
                .expect("failed to build webhook HTTP client"),
        }
    }

    /// Send a webhook event to a single URL.
    /// Failures are logged as warnings but never propagated — webhooks are best-effort.
    pub async fn send(&self, url: &str, event: &WebhookEvent) -> Result<()> {
        let resp = self
            .client
            .post(url)
            .json(event)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("webhook request failed: {}", e))?;

        let status = resp.status();
        if status.is_success() {
            info!(url, event_type = %event.event_type, "webhook delivered");
        } else {
            let body = resp.text().await.unwrap_or_default();
            warn!(
                url,
                event_type = %event.event_type,
                status = %status,
                body = %body,
                "webhook delivery failed"
            );
        }

        Ok(())
    }

    /// Dispatch an event to all configured webhook URLs (fire-and-forget).
    ///
    /// Each URL is attempted independently; failures in one do not affect others.
    pub async fn dispatch(&self, urls: &[String], event: WebhookEvent) {
        if urls.is_empty() {
            return;
        }

        let notifier = self.clone();
        let urls = urls.to_vec();

        tokio::spawn(async move {
            for url in &urls {
                if let Err(e) = notifier.send(url, &event).await {
                    warn!(url, error = %e, "webhook dispatch error");
                }
            }
        });
    }
}

impl Default for WebhookNotifier {
    fn default() -> Self {
        Self::new()
    }
}

// ── Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_violation_event_type() {
        let event = WebhookEvent::policy_violation("tok1", "my-token", "proj1", "deny-all", "blocked");
        assert_eq!(event.event_type, "policy_violation");
        assert_eq!(event.token_id, "tok1");
        assert_eq!(event.details["policy"], "deny-all");
        assert_eq!(event.details["reason"], "blocked");
    }

    #[test]
    fn test_rate_limit_event_type() {
        let event = WebhookEvent::rate_limit_exceeded("tok1", "my-token", "proj1", "rl-policy", 100, 60);
        assert_eq!(event.event_type, "rate_limit_exceeded");
        assert_eq!(event.details["max_requests"], 100);
        assert_eq!(event.details["window_secs"], 60);
    }

    #[test]
    fn test_spend_cap_event_type() {
        let event = WebhookEvent::spend_cap_exceeded("tok1", "my-token", "proj1", "daily cap exceeded");
        assert_eq!(event.event_type, "spend_cap_exceeded");
        assert_eq!(event.details["reason"], "daily cap exceeded");
    }

    #[test]
    fn test_event_serializes_to_json() {
        let event = WebhookEvent::policy_violation("t", "n", "p", "pol", "reason");
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("policy_violation"));
        assert!(json.contains("timestamp"));
    }
}
