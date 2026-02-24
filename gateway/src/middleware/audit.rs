use std::sync::Arc;

use crate::models::audit::{AuditEntry, PolicyResult};
use crate::store::payload_store::PayloadStore;
use sqlx::PgPool;

/// Async audit log writer. Fires off a Tokio task to insert
/// the audit entry into PG without blocking the response path.
///
/// Phase 4: Two-phase insert — metadata to audit_logs, bodies to audit_log_bodies.
/// Phase 6: Payload offloading — bodies > threshold go to S3/MinIO/local via PayloadStore.
pub fn log_async(pool: PgPool, payload_store: Arc<PayloadStore>, entry: AuditEntry) {
    tokio::spawn(async move {
        if let Err(e) = insert_audit_log(&pool, &payload_store, &entry).await {
            tracing::error!(request_id = %entry.request_id, "failed to write audit log: {}", e);
        } else {
            tracing::debug!(request_id = %entry.request_id, "audit log recorded");
        }
    });
}

async fn insert_audit_log(
    pool: &PgPool,
    payload_store: &PayloadStore,
    entry: &AuditEntry,
) -> anyhow::Result<()> {
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

    // ── Payload offloading logic ────────────────────────────────────────────────
    // Only attempt to offload when log_level > 0 and bodies exist.
    let mut payload_url: Option<String> = None;
    let mut should_inline = false;

    if entry.log_level > 0 && (entry.request_body.is_some() || entry.response_body.is_some()) {
        let req_len = entry.request_body.as_deref().map(|s| s.len()).unwrap_or(0);
        let resp_len = entry.response_body.as_deref().map(|s| s.len()).unwrap_or(0);

        if payload_store.should_offload(req_len, resp_len) {
            // Large payload — offload to object store
            match payload_store
                .put(
                    entry.request_id,
                    entry.project_id,
                    entry.timestamp,
                    entry.request_body.as_deref(),
                    entry.response_body.as_deref(),
                    entry.request_headers.as_ref(),
                    entry.response_headers.as_ref(),
                )
                .await
            {
                Ok(url) => {
                    payload_url = Some(url);
                }
                Err(e) => {
                    // Fallback to inline Postgres on object store failure
                    tracing::warn!(
                        request_id = %entry.request_id,
                        "payload offload failed, falling back to Postgres: {}",
                        e
                    );
                    should_inline = true;
                }
            }
        } else {
            // Small payload — store inline in audit_log_bodies
            should_inline = true;
        }
    }

    // ── Phase 1: Insert metadata into audit_logs ───────────────────────────────
    sqlx::query(
        r#"
        INSERT INTO audit_logs (
            id, created_at, project_id, token_id, agent_name, method, path, upstream_url,
            request_body_hash, policies_evaluated, policy_result, policy_mode, deny_reason,
            hitl_required, hitl_decision, hitl_latency_ms, upstream_status,
            response_latency_ms, fields_redacted, shadow_violations, estimated_cost_usd,
            prompt_tokens, completion_tokens, model, ttft_ms, tokens_per_second,
            user_id, tenant_id, external_request_id, log_level,
            tool_calls, tool_call_count, finish_reason,
            session_id, parent_span_id, error_type, is_streaming,
            cache_hit, custom_properties, payload_url
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20, $21,
            $22, $23, $24, $25, $26,
            $27, $28, $29, $30,
            $31, $32, $33,
            $34, $35, $36, $37,
            $38, $39, $40
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
    .bind(entry.response_latency_ms as i64)
    .bind(&entry.fields_redacted)
    .bind(&entry.shadow_violations)
    .bind(entry.estimated_cost_usd)
    // Phase 4 columns
    .bind(entry.prompt_tokens.map(|v| v as i32))
    .bind(entry.completion_tokens.map(|v| v as i32))
    .bind(&entry.model)
    .bind(entry.ttft_ms.map(|v| v as i32))
    .bind(entry.tokens_per_second)
    .bind(&entry.user_id)
    .bind(&entry.tenant_id)
    .bind(&entry.external_request_id)
    .bind(entry.log_level as i16)
    // Phase 5 columns
    .bind(&entry.tool_calls)
    .bind(entry.tool_call_count as i16)
    .bind(&entry.finish_reason)
    .bind(&entry.session_id)
    .bind(&entry.parent_span_id)
    .bind(&entry.error_type)
    .bind(entry.is_streaming)
    .bind(entry.cache_hit)
    // Phase 6 columns
    .bind(&entry.custom_properties)
    .bind(&payload_url)
    .execute(pool)
    .await?;

    // ── Phase 2: Inline bodies into audit_log_bodies (small payloads only) ─────
    if should_inline {
        sqlx::query(
            r#"
            INSERT INTO audit_log_bodies (
                audit_id, created_at, request_body, response_body,
                request_headers, response_headers
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(entry.request_id)
        .bind(entry.timestamp)
        .bind(&entry.request_body)
        .bind(&entry.response_body)
        .bind(&entry.request_headers)
        .bind(&entry.response_headers)
        .execute(pool)
        .await?;
    }

    Ok(())
}
