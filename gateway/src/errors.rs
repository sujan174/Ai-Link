use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("token not found")]
    TokenNotFound,

    #[error("policy denied: {reason}")]
    PolicyDenied { policy: String, reason: String },

    #[error("approval timeout")]
    ApprovalTimeout,

    #[error("approval rejected")]
    ApprovalRejected,

    #[error("rate limit exceeded")]
    RateLimitExceeded,

    #[error("spend cap reached")]
    SpendCapReached,

    #[error("upstream error: {0}")]
    Upstream(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            AppError::TokenNotFound => (StatusCode::UNAUTHORIZED, "invalid or missing token"),
            AppError::PolicyDenied { .. } => (StatusCode::FORBIDDEN, "request blocked by policy"),
            AppError::ApprovalTimeout => (StatusCode::REQUEST_TIMEOUT, "approval timed out"),
            AppError::ApprovalRejected => (StatusCode::FORBIDDEN, "request rejected by reviewer"),
            AppError::RateLimitExceeded => (StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded"),
            AppError::SpendCapReached => (StatusCode::PAYMENT_REQUIRED, "spend cap reached"),
            AppError::Upstream(e) => (StatusCode::BAD_GATEWAY, e.as_str()),
            AppError::Database(e) => {
                tracing::error!("Database error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
            AppError::Redis(e) => {
                tracing::error!("Redis error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
            AppError::Internal(e) => {
                tracing::error!("Internal error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
        };

        let body = Json(json!({ "error": msg }));
        (status, body).into_response()
    }
}
