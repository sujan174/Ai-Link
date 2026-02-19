use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEntry {
    pub request_id: Uuid,
    pub project_id: Uuid,
    pub token_id: String,
    pub agent_name: Option<String>,
    pub method: String,
    pub path: String,
    pub upstream_url: String,
    pub request_body_hash: Option<String>,
    pub policies_evaluated: Option<serde_json::Value>,
    pub policy_result: PolicyResult,
    pub hitl_required: bool,
    pub hitl_decision: Option<String>,
    pub hitl_latency_ms: Option<i32>,
    pub upstream_status: Option<u16>,
    pub response_latency_ms: u64,
    pub fields_redacted: Option<Vec<String>>,
    pub shadow_violations: Option<Vec<String>>,
    pub estimated_cost_usd: Option<rust_decimal::Decimal>,
    pub timestamp: DateTime<Utc>,

    // ── Phase 4: Observability ────────────────────────────────
    /// Privacy level: 0 = metadata only, 1 = redacted bodies, 2 = full debug
    pub log_level: u8,
    /// Request body (None at level 0, PII-scrubbed at level 1, raw at level 2)
    pub request_body: Option<String>,
    /// Response body (same gating as request_body)
    pub response_body: Option<String>,
    /// Request headers as JSON (level 2 only)
    pub request_headers: Option<serde_json::Value>,
    /// Response headers as JSON (level 2 only)
    pub response_headers: Option<serde_json::Value>,
    /// Prompt (input) token count from upstream response
    pub prompt_tokens: Option<u32>,
    /// Completion (output) token count from upstream response
    pub completion_tokens: Option<u32>,
    /// Model name (e.g., "gpt-4o")
    pub model: Option<String>,
    /// Tokens per second (completion_tokens / elapsed_secs)
    pub tokens_per_second: Option<f32>,
    /// Caller-supplied user ID from X-User-ID header
    pub user_id: Option<String>,
    /// Caller-supplied tenant ID from X-Tenant-ID header
    pub tenant_id: Option<String>,
    /// Caller-supplied request ID from X-Request-ID header
    pub external_request_id: Option<String>,

    // ── Phase 5: LLM Observability ───────────────────────────
    /// Tool calls extracted from LLM response (JSON array)
    pub tool_calls: Option<serde_json::Value>,
    /// Number of tool calls in this response
    pub tool_call_count: u16,
    /// Finish reason (stop, tool_calls, length, content_filter, etc.)
    pub finish_reason: Option<String>,
    /// Session ID for grouping conversations (from X-Session-ID)
    pub session_id: Option<String>,
    /// Parent span ID for nested calls (from X-Parent-Span-ID)
    pub parent_span_id: Option<String>,
    /// Classified error type (rate_limit, context_too_long, etc.)
    pub error_type: Option<String>,
    /// Whether this was a streaming (SSE) response
    pub is_streaming: bool,
    /// Time to first token in milliseconds
    pub ttft_ms: Option<u64>,
    /// Whether this response was served from cache
    pub cache_hit: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyResult {
    Allow,
    Deny { policy: String, reason: String },
    ShadowDeny { policy: String, reason: String },
    HitlApproved,
    HitlRejected,
    HitlTimeout,
}
