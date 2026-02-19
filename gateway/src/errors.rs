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

    #[error("payload too large")]
    PayloadTooLarge,

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
        let (status, error_type, code, msg) = match &self {
            AppError::TokenNotFound => (
                StatusCode::UNAUTHORIZED,
                "authentication_error",
                "token_not_found",
                "invalid or missing token".to_string(),
            ),
            AppError::PolicyDenied { policy, reason } => (
                StatusCode::FORBIDDEN,
                "permission_error",
                "policy_denied",
                format!("request blocked by policy '{}': {}", policy, reason),
            ),
            AppError::ApprovalTimeout => (
                StatusCode::REQUEST_TIMEOUT,
                "timeout_error",
                "approval_timeout",
                "approval timed out".to_string(),
            ),
            AppError::ApprovalRejected => (
                StatusCode::FORBIDDEN,
                "permission_error",
                "approval_rejected",
                "request rejected by reviewer".to_string(),
            ),
            AppError::RateLimitExceeded => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limit_error",
                "rate_limit_exceeded",
                "rate limit exceeded".to_string(),
            ),
            AppError::SpendCapReached => (
                StatusCode::PAYMENT_REQUIRED,
                "billing_error",
                "spend_cap_reached",
                "spend cap reached".to_string(),
            ),
            AppError::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "invalid_request_error",
                "payload_too_large",
                "request body exceeds size limit".to_string(),
            ),
            AppError::Upstream(e) => (
                StatusCode::BAD_GATEWAY,
                "upstream_error",
                "upstream_failed",
                e.clone(),
            ),
            AppError::Database(e) => {
                tracing::error!("Database error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "internal_server_error",
                    "internal server error".to_string(),
                )
            }
            AppError::Redis(e) => {
                tracing::error!("Redis error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "internal_server_error",
                    "internal server error".to_string(),
                )
            }
            AppError::Internal(e) => {
                tracing::error!("Internal error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "internal_server_error",
                    "internal server error".to_string(),
                )
            }
        };

        let body = Json(json!({
            "error": {
                "message": msg,
                "type": error_type,
                "code": code,
            }
        }));

        let mut response = (status, body).into_response();

        // Add Retry-After header for rate limit errors
        if matches!(self, AppError::RateLimitExceeded) {
            response.headers_mut().insert(
                "retry-after",
                axum::http::HeaderValue::from_static("60"),
            );
        }

        response
    }
}
