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
    pub upstream_status: Option<u16>, // changed to Option since request might fail before upstream
    pub response_latency_ms: u64,
    pub fields_redacted: Option<Vec<String>>,
    pub shadow_violations: Option<Vec<String>>,
    pub estimated_cost_usd: Option<rust_decimal::Decimal>,
    pub timestamp: DateTime<Utc>,
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
