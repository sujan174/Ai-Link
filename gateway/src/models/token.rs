// Token model — intentionally kept for future use (e.g., API response type).
// The database layer uses `TokenRow` from `store/postgres.rs` for DB operations.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Token {
    pub id: String,
    pub project_id: Uuid,
    pub name: String,
    pub credential_id: Uuid,
    pub upstream_url: String,
    pub scopes: Vec<String>,
    pub policy_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
    pub revoked: bool,
}
