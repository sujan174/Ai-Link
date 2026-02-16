use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApprovalRequest {
    pub id: Uuid,
    pub token_id: Option<String>,
    pub project_id: Uuid,
    pub idempotency_key: Option<String>,
    pub request_summary: serde_json::Value,
    pub status: ApprovalStatus,
    pub reviewed_by: Option<Uuid>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::Type, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "varchar", rename_all = "lowercase")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
    Expired,
}
