use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::approval::ApprovalStatus;
use crate::store::postgres::{AuditLogDetailRow, AuditLogRow, CredentialMeta, PolicyRow, TokenRow};
use crate::AppState;

// ── Request / Response DTOs ──────────────────────────────────

#[derive(Deserialize)]
pub struct CreateTokenRequest {
    pub name: String,
    pub credential_id: Uuid,
    pub upstream_url: String,
    pub project_id: Option<Uuid>,
    pub policy_ids: Option<Vec<Uuid>>,
}

#[derive(Serialize)]
pub struct CreateTokenResponse {
    pub token_id: String,
    pub name: String,
    pub message: String,
}

#[derive(Deserialize)]
pub struct DecisionRequest {
    pub decision: String, // "approved" | "rejected"
}

#[derive(Serialize)]
pub struct DecisionResponse {
    pub id: Uuid,
    pub status: String,
    pub updated: bool,
}

#[derive(Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub project_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
}

#[derive(Serialize)]
pub struct ProjectResponse {
    pub id: Uuid,
    pub name: String,
}

// ── Default org ID for MVP ───────────────────────────────
fn default_org_id() -> Uuid {
    Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
}

// ── Default project ID for MVP ───────────────────────────────
fn default_project_id() -> Uuid {
    Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
}

// ── Handlers ─────────────────────────────────────────────────

/// GET /api/v1/projects — list projects for the default org
pub async fn list_projects(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ProjectResponse>>, StatusCode> {
    let org_id = default_org_id();
    let projects = state.db.list_projects(org_id).await.map_err(|e| {
        tracing::error!("list_projects failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        projects
            .into_iter()
            .map(|p| ProjectResponse {
                id: p.id,
                name: p.name,
            })
            .collect(),
    ))
}

/// POST /api/v1/projects — create a new project
pub async fn create_project(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectResponse>), StatusCode> {
    let org_id = default_org_id();
    let id = state
        .db
        .create_project(org_id, &payload.name)
        .await
        .map_err(|e| {
            tracing::error!("create_project failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok((
        StatusCode::CREATED,
        Json(ProjectResponse {
            id,
            name: payload.name,
        }),
    ))
}

/// GET /api/v1/tokens — list all tokens for a project
pub async fn list_tokens(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<TokenRow>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let tokens = state.db.list_tokens(project_id).await.map_err(|e| {
        tracing::error!("list_tokens failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(tokens))
}

/// POST /api/v1/tokens — create a new virtual token
pub async fn create_token(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateTokenRequest>,
) -> Result<(StatusCode, Json<CreateTokenResponse>), StatusCode> {
    let project_id = payload.project_id.unwrap_or_else(default_project_id);

    // Validate upstream URL (SSRF protection — same as CLI)
    let url = reqwest::Url::parse(&payload.upstream_url).map_err(|_| {
        tracing::warn!(
            "create_token: invalid upstream URL: {}",
            payload.upstream_url
        );
        StatusCode::BAD_REQUEST
    })?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Generate token ID
    let proj_short = &project_id.to_string()[..8];
    let mut random_bytes = [0u8; 16];
    use aes_gcm::aead::OsRng;
    use rand::RngCore;
    OsRng.fill_bytes(&mut random_bytes);
    let token_id = format!("ailink_v1_{}_tok_{}", proj_short, hex::encode(random_bytes));

    let new_token = crate::store::postgres::NewToken {
        id: token_id.clone(),
        project_id,
        name: payload.name.clone(),
        credential_id: payload.credential_id,
        upstream_url: payload.upstream_url,
        scopes: serde_json::json!([]),
        policy_ids: payload.policy_ids.unwrap_or_default(),
    };

    state.db.insert_token(&new_token).await.map_err(|e| {
        tracing::error!("create_token failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(CreateTokenResponse {
            token_id: token_id.clone(),
            name: payload.name,
            message: format!("Use: Authorization: Bearer {}", token_id),
        }),
    ))
}

/// GET /api/v1/approvals — list pending HITL requests
pub async fn list_approvals(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<crate::models::approval::ApprovalRequest>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let approvals = state
        .db
        .list_pending_approvals(project_id)
        .await
        .map_err(|e| {
            tracing::error!("list_approvals failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(approvals))
}

/// POST /api/v1/approvals/:id/decision — approve or reject a request
pub async fn decide_approval(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
    Query(params): Query<PaginationParams>,
    Json(payload): Json<DecisionRequest>,
) -> Result<Json<DecisionResponse>, StatusCode> {
    let id = Uuid::parse_str(&id_str).map_err(|_| {
        tracing::warn!("decide_approval: invalid UUID: {}", id_str);
        StatusCode::BAD_REQUEST
    })?;
    // Map string to enum
    let status = match payload.decision.to_lowercase().as_str() {
        "approved" | "approve" => ApprovalStatus::Approved,
        "rejected" | "reject" => ApprovalStatus::Rejected,
        other => {
            tracing::warn!("decide_approval: invalid decision: {}", other);
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    // Extract project_id from query or default
    let project_id = params.project_id.unwrap_or_else(default_project_id);
    tracing::info!(
        "decide_approval: properties id={}, project_id={}, status={:?}",
        id,
        project_id,
        status
    );

    let updated = state
        .db
        .update_approval_status(id, project_id, status.clone())
        .await
        .map_err(|e| {
            tracing::error!("decide_approval failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let status_str = match status {
        ApprovalStatus::Approved => "approved",
        ApprovalStatus::Rejected => "rejected",
        _ => "unknown",
    };

    Ok(Json(DecisionResponse {
        id,
        status: status_str.to_string(),
        updated,
    }))
}

/// GET /api/v1/audit — paginated audit logs
pub async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<AuditLogRow>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);
    let limit = params.limit.unwrap_or(50).clamp(1, 200); // 1 <= limit <= 200
    let offset = params.offset.unwrap_or(0).max(0); // non-negative

    let logs = state
        .db
        .list_audit_logs(project_id, limit, offset)
        .await
        .map_err(|e| {
            tracing::error!("list_audit_logs failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(logs))
}

/// GET /api/v1/audit/:id — single audit log detail with bodies
pub async fn get_audit_log(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<AuditLogDetailRow>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);
    let log_id = Uuid::parse_str(&id_str).map_err(|_| StatusCode::BAD_REQUEST)?;

    let log = state
        .db
        .get_audit_log_detail(log_id, project_id)
        .await
        .map_err(|e| {
            tracing::error!("get_audit_log_detail failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(log))
}

// ── Policy DTOs ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreatePolicyRequest {
    pub name: String,
    pub mode: Option<String>, // "enforce" | "shadow", defaults to "enforce"
    pub phase: Option<String>, // "pre" | "post", defaults to "pre"
    pub rules: serde_json::Value,
    pub retry: Option<serde_json::Value>,
    pub project_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdatePolicyRequest {
    pub name: Option<String>,
    pub mode: Option<String>,
    pub phase: Option<String>,
    pub rules: Option<serde_json::Value>,
    pub retry: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct PolicyResponse {
    pub id: Uuid,
    pub name: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct DeleteResponse {
    pub id: Uuid,
    pub deleted: bool,
}

// ── Credential DTOs ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateCredentialRequest {
    pub name: String,
    pub provider: String,
    pub secret: String, // plaintext API key — will be encrypted
    pub project_id: Option<Uuid>,
    pub injection_mode: Option<String>, // "header" (default) | "bearer"
    pub injection_header: Option<String>, // e.g. "Authorization"
}

#[derive(Serialize)]
pub struct CreateCredentialResponse {
    pub id: Uuid,
    pub name: String,
    pub message: String,
}

// ── Revoke DTO ───────────────────────────────────────────────

#[derive(Serialize)]
pub struct RevokeResponse {
    pub token_id: String,
    pub revoked: bool,
}

// ── Policy Handlers ──────────────────────────────────────────

/// GET /api/v1/policies — list all policies for a project
pub async fn list_policies(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<PolicyRow>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let policies = state.db.list_policies(project_id).await.map_err(|e| {
        tracing::error!("list_policies failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(policies))
}

/// POST /api/v1/policies — create a new policy
pub async fn create_policy(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreatePolicyRequest>,
) -> impl IntoResponse {
    let project_id = payload.project_id.unwrap_or_else(default_project_id);
    let mode = payload.mode.unwrap_or_else(|| "enforce".to_string());
    let phase = payload.phase.unwrap_or_else(|| "pre".to_string());

    // Validate mode
    if mode != "enforce" && mode != "shadow" {
        tracing::warn!("create_policy: invalid mode: {}", mode);
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("invalid mode: {}", mode) })),
        ).into_response();
    }

    
    // Validate phase
    if phase != "pre" && phase != "post" {
        tracing::warn!("create_policy: invalid phase: {}", phase);
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("invalid phase: {}", phase) })),
        ).into_response();
    }

    match state
        .db
        .insert_policy(project_id, &payload.name, &mode, &phase, payload.rules, payload.retry)
        .await
    {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!(PolicyResponse {
                id,
                name: payload.name,
                message: "Policy created".to_string(),
            })),
        ).into_response(),
        Err(e) => {
            tracing::error!("create_policy failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            ).into_response()
        }
    }
}

/// PUT /api/v1/policies/:id — update a policy
pub async fn update_policy(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
    Json(payload): Json<UpdatePolicyRequest>,
) -> Result<Json<PolicyResponse>, StatusCode> {
    let id = Uuid::parse_str(&id_str).map_err(|_| StatusCode::BAD_REQUEST)?;
    let project_id = default_project_id();

    // Validate mode if provided
    if let Some(ref mode) = payload.mode {
        if mode != "enforce" && mode != "shadow" {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    // Validate phase if provided
    if let Some(ref phase) = payload.phase {
        if phase != "pre" && phase != "post" {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    let updated = state
        .db
        .update_policy(
            id,
            project_id,
            payload.mode.as_deref(),
            payload.phase.as_deref(),
            payload.rules,
            payload.retry,
            payload.name.as_deref(),
        )
        .await
        .map_err(|e| {
            tracing::error!("update_policy failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if !updated {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(PolicyResponse {
        id,
        name: payload.name.unwrap_or_default(),
        message: "Policy updated".to_string(),
    }))
}

/// DELETE /api/v1/policies/:id — soft-delete a policy
pub async fn delete_policy(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
) -> Result<Json<DeleteResponse>, StatusCode> {
    let id = Uuid::parse_str(&id_str).map_err(|_| StatusCode::BAD_REQUEST)?;
    let project_id = default_project_id();

    let deleted = state.db.delete_policy(id, project_id).await.map_err(|e| {
        tracing::error!("delete_policy failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(DeleteResponse { id, deleted }))
}

// ── Credential Handlers ──────────────────────────────────────

/// GET /api/v1/credentials — list credential metadata (no secrets)
pub async fn list_credentials(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<CredentialMeta>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let creds = state.db.list_credentials(project_id).await.map_err(|e| {
        tracing::error!("list_credentials failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(creds))
}

/// POST /api/v1/credentials — create a new encrypted credential
pub async fn create_credential(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateCredentialRequest>,
) -> Result<(StatusCode, Json<CreateCredentialResponse>), StatusCode> {
    let project_id = payload.project_id.unwrap_or_else(default_project_id);

    // Encrypt the secret using the vault
    let (encrypted_dek, dek_nonce, encrypted_secret, secret_nonce) =
        state.vault.encrypt_string(&payload.secret).map_err(|e| {
            tracing::error!("credential encryption failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let injection_mode = payload
        .injection_mode
        .unwrap_or_else(|| "bearer".to_string());
    let injection_header = payload
        .injection_header
        .unwrap_or_else(|| "Authorization".to_string());

    // Validate injection mode
    match injection_mode.as_str() {
        "bearer" | "basic" | "header" | "query" => {}
        _ => {
            tracing::warn!(
                "create_credential: invalid injection_mode: {}",
                injection_mode
            );
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    // Validate injection header name
    if reqwest::header::HeaderName::from_bytes(injection_header.as_bytes()).is_err() {
        tracing::warn!(
            "create_credential: invalid injection_header: {}",
            injection_header
        );
        return Err(StatusCode::BAD_REQUEST);
    }

    let new_cred = crate::store::postgres::NewCredential {
        project_id,
        name: payload.name.clone(),
        provider: payload.provider,
        encrypted_dek,
        dek_nonce,
        encrypted_secret,
        secret_nonce,
        injection_mode,
        injection_header,
    };

    let id = state.db.insert_credential(&new_cred).await.map_err(|e| {
        tracing::error!("create_credential failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(CreateCredentialResponse {
            id,
            name: payload.name,
            message: "Credential encrypted and stored".to_string(),
        }),
    ))
}

// ── Token Revocation Handler ─────────────────────────────────

/// DELETE /api/v1/tokens/:id — revoke a token
pub async fn revoke_token(
    State(state): State<Arc<AppState>>,
    Path(token_id): Path<String>,
) -> Result<Json<RevokeResponse>, StatusCode> {
    let revoked = state.db.revoke_token(&token_id).await.map_err(|e| {
        tracing::error!("revoke_token failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(RevokeResponse { token_id, revoked }))
}
