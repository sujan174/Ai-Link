use crate::api::handlers::PaginationParams;
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

// ── Default project ID for MVP ───────────────────────────────
fn default_project_id() -> Uuid {
    Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
}

/// GET /api/v1/analytics/volume — 24h request volume bucketed by hour
pub async fn get_request_volume(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<crate::models::analytics::VolumeStat>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let stats = state
        .db
        .get_request_volume_24h(project_id)
        .await
        .map_err(|e| {
            tracing::error!("get_request_volume failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(stats))
}

/// GET /api/v1/analytics/status — 24h status code distribution
pub async fn get_status_distribution(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<crate::models::analytics::StatusStat>>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let stats = state
        .db
        .get_status_code_distribution_24h(project_id)
        .await
        .map_err(|e| {
            tracing::error!("get_status_distribution failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(stats))
}

/// GET /api/v1/analytics/latency — 24h latency percentiles (P50, P90, P99)
pub async fn get_latency_percentiles(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<crate::models::analytics::LatencyStat>, StatusCode> {
    let project_id = params.project_id.unwrap_or_else(default_project_id);

    let stats = state
        .db
        .get_latency_percentiles_24h(project_id)
        .await
        .map_err(|e| {
            tracing::error!("get_latency_percentiles failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(stats))
}
