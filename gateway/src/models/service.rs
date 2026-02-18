use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A registered external service (e.g., Stripe, Slack, OpenAI).
///
/// Services define the upstream base URL and link to a credential
/// that the gateway will inject when proxying requests.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Service {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: String,
    pub base_url: String,
    pub service_type: String,
    pub credential_id: Option<Uuid>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
