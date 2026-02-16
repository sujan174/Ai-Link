use std::sync::Arc;

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::trace::TraceLayer;

use crate::AppState;

pub mod analytics;
pub mod handlers;

/// Build the Management API router.
/// All routes are relative — the caller mounts this under `/api/v1`.
pub fn api_router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/tokens",
            get(handlers::list_tokens).post(handlers::create_token),
        )
        .route("/tokens/:id", delete(handlers::revoke_token))
        .route(
            "/policies",
            get(handlers::list_policies).post(handlers::create_policy),
        )
        .route(
            "/policies/:id",
            put(handlers::update_policy).delete(handlers::delete_policy),
        )
        .route(
            "/credentials",
            get(handlers::list_credentials).post(handlers::create_credential),
        )
        .route(
            "/projects",
            get(handlers::list_projects).post(handlers::create_project),
        )
        .route("/approvals", get(handlers::list_approvals))
        .route("/approvals/:id/decision", post(handlers::decide_approval))
        .route("/audit", get(handlers::list_audit_logs))
        .route("/analytics/volume", get(analytics::get_request_volume))
        .route("/analytics/status", get(analytics::get_status_distribution))
        .route(
            "/analytics/latency",
            get(analytics::get_latency_percentiles),
        )
        .layer(middleware::from_fn(admin_auth))
        .layer(TraceLayer::new_for_http())
        .fallback(fallback_404)
}

async fn fallback_404() -> StatusCode {
    StatusCode::NOT_FOUND
}

/// Middleware: validates `X-Admin-Key` header against the configured admin key.
/// Returns 401 if missing/invalid, 500 if server config is broken.
async fn admin_auth(req: Request, next: Next) -> Result<Response, StatusCode> {
    let provided_key = req
        .headers()
        .get("x-admin-key")
        .and_then(|v| v.to_str().ok())
        .or_else(|| {
            req.headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(|t| t.trim())
        });

    let expected = std::env::var("AILINK_ADMIN_KEY")
        .or_else(|_| std::env::var("AILINK_MASTER_KEY"))
        .map_err(|_| {
            tracing::error!("neither AILINK_ADMIN_KEY nor AILINK_MASTER_KEY is set");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match provided_key {
        Some(k) if k == expected => Ok(next.run(req).await),
        Some(k) => {
            tracing::warn!(
                "admin API: invalid admin key. Provided: '{}', My: '{}'",
                k,
                expected
            );
            Err(StatusCode::UNAUTHORIZED)
        }
        None => {
            tracing::warn!("admin API: missing X-Admin-Key header");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}
