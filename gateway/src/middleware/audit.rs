use crate::models::audit::{AuditEntry, PolicyResult};
use sqlx::PgPool;

/// Async audit log writer. Fires off a Tokio task to insert
/// the audit entry into PG without blocking the response path.
pub fn log_async(pool: PgPool, entry: AuditEntry) {
    tokio::spawn(async move {
        if let Err(e) = insert_audit_log(&pool, &entry).await {
            tracing::error!(request_id = %entry.request_id, "failed to write audit log: {}", e);
        } else {
            tracing::debug!(request_id = %entry.request_id, "audit log recorded");
        }
    });
}

async fn insert_audit_log(pool: &PgPool, entry: &AuditEntry) -> anyhow::Result<()> {
    let (policy_res, policy_mode, deny_reason) = match &entry.policy_result {
        PolicyResult::Allow => ("allowed", None, None),
        PolicyResult::Deny { policy: _, reason } => {
            ("denied", Some("enforce"), Some(reason.as_str()))
        }
        PolicyResult::ShadowDeny { policy: _, reason } => {
            ("allowed", Some("shadow"), Some(reason.as_str()))
        }
        PolicyResult::HitlApproved => ("approved", Some("hitl"), None),
        PolicyResult::HitlRejected => ("rejected", Some("hitl"), None),
        PolicyResult::HitlTimeout => ("timeout", Some("hitl"), None),
    };

    sqlx::query(
        r#"
        INSERT INTO audit_logs (
            id, created_at, project_id, token_id, agent_name, method, path, upstream_url,
            request_body_hash, policies_evaluated, policy_result, policy_mode, deny_reason,
            hitl_required, hitl_decision, hitl_latency_ms, upstream_status,
            response_latency_ms, fields_redacted, shadow_violations, estimated_cost_usd
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20, $21
        )
        "#,
    )
    .bind(entry.request_id)
    .bind(entry.timestamp)
    .bind(entry.project_id)
    .bind(&entry.token_id)
    .bind(&entry.agent_name)
    .bind(&entry.method)
    .bind(&entry.path)
    .bind(&entry.upstream_url)
    .bind(&entry.request_body_hash)
    .bind(&entry.policies_evaluated)
    .bind(policy_res)
    .bind(policy_mode)
    .bind(deny_reason)
    .bind(entry.hitl_required)
    .bind(&entry.hitl_decision)
    .bind(entry.hitl_latency_ms)
    .bind(entry.upstream_status.map(|s| s as i16))
    .bind(entry.response_latency_ms as i32)
    .bind(&entry.fields_redacted)
    .bind(&entry.shadow_violations)
    .bind(entry.estimated_cost_usd)
    .execute(pool)
    .await?;

    Ok(())
}
