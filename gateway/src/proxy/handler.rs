use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::{Body, Bytes};
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::Response;
use uuid::Uuid;

use crate::errors::AppError;
use crate::middleware;
use crate::models::cost::{self, extract_model, extract_usage};
use crate::proxy;
use crate::vault::SecretStore;
use crate::AppState;

/// The main handler for all proxied requests.
#[tracing::instrument(skip(state, headers, body), fields(req_id = %uuid::Uuid::new_v4()))]
pub async fn proxy_handler(
    State(state): State<Arc<AppState>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    let start = Instant::now();
    let request_id = Uuid::new_v4();

    // Copy agent name header before consuming request
    let agent_name = headers
        .get("X-AIlink-Agent-Name")
        .or_else(|| headers.get("user-agent"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Copy idempotency key for HITL
    let idempotency_key = headers
        .get("X-AIlink-Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // TEST HOOK: Extract cost override header early
    let test_cost_override = headers
        .get("X-AILink-Test-Cost")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| rust_decimal::Decimal::from_str(s).ok());

    // Copy original Content-Type before consuming request
    let original_content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();

    // -- 1. Extract virtual token --
    let token_str = extract_bearer_token(&headers)?;

    // -- 2. Resolve token --
    let token = state
        .db
        .get_token(&token_str)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::TokenNotFound)?;

    if !token.is_active {
        return Err(AppError::TokenNotFound);
    }

    // -- 3. Evaluate policies --
    // method and uri are already available
    let path = uri.path().to_string();

    let policies = state
        .db
        .get_policies_for_token(&token.policy_ids)
        .await
        .map_err(AppError::Internal)?;

    // -- 3.1 Rate Limit --
    let mut shadow_violations =
        match middleware::rate_limit::check_rate_limits(&token.id, &policies, &state.cache).await {
            Ok(v) => v,
            Err(e) => {
                log_audit_entry(
                    &state,
                    request_id,
                    token.project_id,
                    token.id.clone(),
                    agent_name,
                    method.to_string(),
                    path,
                    token.upstream_url.clone(),
                    &policies,
                    crate::models::audit::PolicyResult::Deny {
                        policy: "RateLimit".to_string(),
                        reason: e.to_string(),
                    },
                    false,
                    None,
                    None,
                    None,
                    start.elapsed().as_millis() as u64,
                    None,
                    None,
                    None, // Cost
                );
                return Err(e);
            }
        };

    let middleware::policy::EvaluationResult {
        decision,
        shadow_violations: policy_violations,
    } = match middleware::policy::evaluate_rules(&policies, &method, &path) {
        Ok(res) => res,
        Err(e) => {
            let reason = match &e {
                AppError::PolicyDenied { policy, reason } => {
                    crate::models::audit::PolicyResult::Deny {
                        policy: policy.clone(),
                        reason: reason.clone(),
                    }
                }
                _ => crate::models::audit::PolicyResult::Deny {
                    policy: "unknown".to_string(),
                    reason: e.to_string(),
                },
            };
            log_audit_entry(
                &state,
                request_id,
                token.project_id,
                token.id.clone(),
                agent_name,
                method.to_string(),
                path,
                token.upstream_url.clone(),
                &policies,
                reason,
                false,
                None,
                None,
                None,
                start.elapsed().as_millis() as u64,
                None,
                if shadow_violations.is_empty() {
                    None
                } else {
                    Some(shadow_violations)
                },
                None,
            );
            return Err(e);
        }
    };

    shadow_violations.extend(policy_violations);

    // -- 3.2 Check Spend Cap --
    // We check this after rate limits but before HITL/Upstream
    if let Err(e) = middleware::spend::check_spend_cap(&state.cache, &token.id, &policies).await {
        log_audit_entry(
            &state,
            request_id,
            token.project_id,
            token.id.clone(),
            agent_name,
            method.to_string(),
            path,
            token.upstream_url.clone(),
            &policies,
            crate::models::audit::PolicyResult::Deny {
                policy: "SpendCap".to_string(),
                reason: e.to_string(),
            },
            false,
            None,
            None,
            None,
            start.elapsed().as_millis() as u64,
            None,
            None,
            None,
        );
        return Err(AppError::SpendCapReached);
    }

    // -- 3.5 Handle HITL --
    let mut hitl_decision = None;
    let mut hitl_latency_ms = None;
    let mut hitl_required = false;

    if let middleware::policy::PolicyDecision::HitlRequired = decision {
        hitl_required = true;
        let hitl_start = Instant::now();

        // Create approval request
        let summary = serde_json::json!({
            "method": method.to_string(),
            "path": path,
            "agent": agent_name,
            "upstream": token.upstream_url,
        });

        // Expiry: 10 minutes
        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(10);

        let approval_id = state
            .db
            .create_approval_request(
                &token.id,
                token.project_id,
                idempotency_key.clone(),
                summary.clone(), // Clone summary for notification
                expires_at,
            )
            .await
            .map_err(AppError::Internal)?;

        // Send Slack notification (async)
        let notifier = state.notifier.clone();
        let app_id = approval_id;
        let summary_clone = summary.clone();
        let expires_at_clone = expires_at;
        tokio::spawn(async move {
            if let Err(e) = notifier
                .send_approval_request(&app_id, &summary_clone, &expires_at_clone)
                .await
            {
                tracing::error!("Failed to send approval notification: {}", e);
            }
        });

        // Poll for status (max 30s)
        // TODO: Use Redis pub/sub or long-polling for better efficiency
        let mut approved = false;
        for _ in 0..30 {
            let status = state
                .db
                .get_approval_status(approval_id)
                .await
                .map_err(AppError::Internal)?;

            match status.as_str() {
                "approved" => {
                    approved = true;
                    hitl_decision = Some("approved".to_string());
                    break;
                }
                "rejected" => {
                    hitl_decision = Some("rejected".to_string());
                    log_audit_entry(
                        &state,
                        request_id,
                        token.project_id,
                        token.id.clone(),
                        agent_name,
                        method.to_string(),
                        path,
                        token.upstream_url.clone(),
                        &policies,
                        crate::models::audit::PolicyResult::HitlRejected,
                        true,
                        hitl_decision.clone(),
                        Some(hitl_start.elapsed().as_millis() as i32),
                        None,
                        start.elapsed().as_millis() as u64,
                        None,
                        if shadow_violations.is_empty() {
                            None
                        } else {
                            Some(shadow_violations.clone())
                        },
                        None,
                    );
                    return Err(AppError::ApprovalRejected);
                }
                "expired" => {
                    hitl_decision = Some("expired".to_string());
                    log_audit_entry(
                        &state,
                        request_id,
                        token.project_id,
                        token.id.clone(),
                        agent_name,
                        method.to_string(),
                        path,
                        token.upstream_url.clone(),
                        &policies,
                        crate::models::audit::PolicyResult::HitlTimeout,
                        true,
                        hitl_decision.clone(),
                        Some(hitl_start.elapsed().as_millis() as i32),
                        None,
                        start.elapsed().as_millis() as u64,
                        None,
                        if shadow_violations.is_empty() {
                            None
                        } else {
                            Some(shadow_violations.clone())
                        },
                        None,
                    );
                    return Err(AppError::ApprovalTimeout);
                }
                _ => {
                    // Pending, wait 1s
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }

        if !approved {
            hitl_decision = Some("timeout".to_string());
            log_audit_entry(
                &state,
                request_id,
                token.project_id,
                token.id.clone(),
                agent_name,
                method.to_string(),
                path,
                token.upstream_url.clone(),
                &policies,
                crate::models::audit::PolicyResult::HitlTimeout,
                true,
                hitl_decision.clone(),
                Some(hitl_start.elapsed().as_millis() as i32),
                None,
                start.elapsed().as_millis() as u64,
                None,
                if shadow_violations.is_empty() {
                    None
                } else {
                    Some(shadow_violations.clone())
                },
                None,
            );
            return Err(AppError::ApprovalTimeout);
        }

        hitl_latency_ms = Some(hitl_start.elapsed().as_millis() as i32);
    }

    // -- 4. Decrypt real API key + get injection config --
    let (mut real_key, _provider, injection_mode, injection_header) = state
        .vault
        .retrieve(&token.credential_id.to_string())
        .await
        .map_err(AppError::Internal)?;

    // -- 5. Build upstream request --
    let upstream_url = proxy::transform::rewrite_url(&token.upstream_url, &path);

    // Collect the request body
    // body is already extracted as Bytes
    let body_bytes = body;

    // Build upstream headers: strip Authorization, inject real key based on injection_mode
    let mut upstream_headers = reqwest::header::HeaderMap::new();

    let header_name: reqwest::header::HeaderName = injection_header.parse().map_err(|_| {
        AppError::Internal(anyhow::anyhow!(
            "invalid injection_header: {}",
            injection_header
        ))
    })?;

    match injection_mode.as_str() {
        "basic" => {
            // Auto base64-encode the secret (e.g., "user@co.com:api_token" → base64)
            use base64::Engine;
            let encoded = base64::engine::general_purpose::STANDARD.encode(&real_key);
            upstream_headers.insert(
                header_name,
                reqwest::header::HeaderValue::from_str(&format!("Basic {}", encoded))
                    .map_err(|_| AppError::Internal(anyhow::anyhow!("invalid key format")))?,
            );
        }
        "header" => {
            // Raw value into custom header (e.g., X-API-Key: AKIA...)
            upstream_headers.insert(
                header_name,
                reqwest::header::HeaderValue::from_str(&real_key)
                    .map_err(|_| AppError::Internal(anyhow::anyhow!("invalid key format")))?,
            );
        }
        "query" => {
            // Don't inject a header — we'll append to the URL below
        }
        _ => {
            // Default: Bearer token (OpenAI, Stripe, GitHub, Slack, etc.)
            upstream_headers.insert(
                header_name,
                reqwest::header::HeaderValue::from_str(&format!("Bearer {}", real_key))
                    .map_err(|_| AppError::Internal(anyhow::anyhow!("invalid key format")))?,
            );
        }
    }

    upstream_headers.insert(
        "Content-Type",
        reqwest::header::HeaderValue::from_str(&original_content_type).unwrap_or(
            reqwest::header::HeaderValue::from_static("application/json"),
        ),
    );

    // Convert method Axum -> Reqwest
    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid method: {}", e)))?;

    // Handle query param injection by appending to the URL
    let final_upstream_url = if injection_mode == "query" {
        let separator = if upstream_url.contains('?') { "&" } else { "?" };
        format!(
            "{}{}{}={}",
            upstream_url,
            separator,
            injection_header,
            urlencoding::encode(&real_key)
        )
    } else {
        upstream_url.clone()
    };

    // Zero the decrypted key from memory using `zeroize` crate
    // This uses volatile writes that the compiler CANNOT optimize away
    {
        use zeroize::Zeroize;
        real_key.zeroize();
    }

    // Forward with explicit timeout safety
    let upstream_resp = match tokio::time::timeout(
        Duration::from_secs(10),
        state.upstream_client.forward(
            reqwest_method,
            &final_upstream_url,
            upstream_headers,
            body_bytes.to_vec(),
        ),
    )
    .await
    {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => {
            tracing::error!("Upstream request failed: {}", e);
            log_audit_entry(
                &state,
                request_id,
                token.project_id,
                token.id.clone(),
                agent_name,
                method.to_string(),
                path,
                upstream_url,
                &policies,
                if hitl_required {
                    crate::models::audit::PolicyResult::HitlApproved
                } else {
                    crate::models::audit::PolicyResult::Allow
                },
                hitl_required,
                hitl_decision,
                hitl_latency_ms,
                Some(502),
                start.elapsed().as_millis() as u64,
                None,
                if shadow_violations.is_empty() {
                    None
                } else {
                    Some(shadow_violations)
                },
                None,
            );
            return Err(e);
        }
        Err(_) => {
            tracing::error!("Upstream request timed out (safety net)");
            // Log timeout
            log_audit_entry(
                &state,
                request_id,
                token.project_id,
                token.id.clone(),
                agent_name,
                method.to_string(),
                path,
                upstream_url,
                &policies,
                if hitl_required {
                    crate::models::audit::PolicyResult::HitlApproved
                } else {
                    crate::models::audit::PolicyResult::Allow
                },
                hitl_required,
                hitl_decision,
                hitl_latency_ms,
                Some(504),
                start.elapsed().as_millis() as u64,
                None,
                if shadow_violations.is_empty() {
                    None
                } else {
                    Some(shadow_violations)
                },
                None,
            );
            return Err(AppError::Upstream("Upstream request timed out".to_string()));
        }
    };

    let status = upstream_resp.status();
    let resp_headers = upstream_resp.headers().clone();
    let resp_body = upstream_resp
        .bytes()
        .await
        .map_err(|e| AppError::Upstream(format!("upstream body read failed: {}", e)))?;

    // -- 6. Sanitize response --
    let content_type = resp_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");
    let sanitization_result = middleware::sanitize::sanitize_response(&resp_body, content_type);
    let sanitized_body = sanitization_result.body;

    // -- 6.1 Calculate Cost & Update Spend --
    let mut estimated_cost_usd = None;

    // TEST HOOK: Allow forcing cost via header for deterministic testing
    if let Some(cost_val) = test_cost_override {
        estimated_cost_usd = Some(cost_val);
        let _ = middleware::spend::track_spend(
            &state.cache,
            state.db.pool(),
            &token.id,
            token.project_id,
            cost_val,
            &policies,
        )
        .await;
    }

    if estimated_cost_usd.is_none() {
        match extract_usage(&token.upstream_url, &sanitized_body) {
            Ok(Some((input, output))) => {
                // Heuristic: guess model from response or request?
                // Ideally we parse "model" field from response body.
                let model = extract_model(&sanitized_body).unwrap_or("unknown".to_string());

                // Deduce provider from URL
                let provider = if token.upstream_url.contains("anthropic") {
                    "anthropic"
                } else {
                    "openai"
                };
                let final_cost = cost::calculate_cost(provider, &model, input, output);

                if !final_cost.is_zero() {
                    estimated_cost_usd = Some(final_cost);
                    // Spawn tracking to avoid blocking response?
                    // Or await it? It updates Redis (fast).
                    if let Err(e) = middleware::spend::track_spend(
                        &state.cache,
                        state.db.pool(),
                        &token.id,
                        token.project_id,
                        final_cost,
                        &policies,
                    )
                    .await
                    {
                        tracing::error!("Failed to track spend: {}", e);
                    }
                }
            }
            Ok(None) => {} // No usage found
            Err(e) => tracing::warn!("Failed to extract usage: {}", e),
        }
    }

    // -- 7. Emit audit log --
    // -- 7. Emit audit log --
    log_audit_entry(
        &state,
        request_id,
        token.project_id,
        token.id.clone(),
        agent_name,
        method.to_string(),
        path,
        upstream_url,
        &policies,
        if hitl_required {
            crate::models::audit::PolicyResult::HitlApproved
        } else {
            crate::models::audit::PolicyResult::Allow
        },
        hitl_required,
        hitl_decision,
        hitl_latency_ms,
        Some(status.as_u16()),
        start.elapsed().as_millis() as u64,
        if sanitization_result.redacted_types.is_empty() {
            None
        } else {
            Some(sanitization_result.redacted_types)
        },
        if shadow_violations.is_empty() {
            None
        } else {
            Some(shadow_violations)
        },
        estimated_cost_usd,
    );

    // -- Build response --
    let axum_status =
        StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut response = Response::builder().status(axum_status);

    for (key, value) in resp_headers.iter() {
        if let Ok(name) = axum::http::HeaderName::from_bytes(key.as_str().as_bytes()) {
            if let Ok(val) = axum::http::HeaderValue::from_bytes(value.as_bytes()) {
                if !matches!(
                    name.as_str(),
                    "server"
                        | "x-request-id"
                        | "x-powered-by"
                        | "content-length"
                        | "transfer-encoding"
                ) {
                    response = response.header(name, val);
                }
            }
        }
    }

    response
        .body(Body::from(sanitized_body))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("response build failed: {}", e)))
}

#[allow(clippy::too_many_arguments)]
fn log_audit_entry(
    state: &AppState,
    req_id: Uuid,
    project_id: Uuid,
    token_id: String,
    agent_name: Option<String>,
    method: String,
    path: String,
    upstream_url: String,
    policies: &[crate::models::policy::Policy],
    policy_result: crate::models::audit::PolicyResult,
    hitl_required: bool,
    hitl_decision: Option<String>,
    hitl_latency_ms: Option<i32>,
    upstream_status: Option<u16>,
    response_latency_ms: u64,
    fields_redacted: Option<Vec<String>>,
    shadow_violations: Option<Vec<String>>,
    estimated_cost_usd: Option<rust_decimal::Decimal>,
) {
    let entry = crate::models::audit::AuditEntry {
        request_id: req_id,
        project_id,
        token_id,
        agent_name,
        method,
        path,
        upstream_url,
        request_body_hash: None,
        policies_evaluated: Some(serde_json::json!(policies
            .iter()
            .map(|p| &p.name)
            .collect::<Vec<_>>())),
        policy_result,
        hitl_required,
        hitl_decision,
        hitl_latency_ms,
        upstream_status,
        response_latency_ms,
        fields_redacted,
        shadow_violations,
        estimated_cost_usd,
        timestamp: chrono::Utc::now(),
    };
    middleware::audit::log_async(state.db.pool().clone(), entry);
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<String, AppError> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::TokenNotFound)?;

    if !auth.starts_with("Bearer ") {
        return Err(AppError::TokenNotFound);
    }
    let token = auth[7..].trim().to_string();
    if !token.starts_with("ailink_v1_") {
        return Err(AppError::TokenNotFound);
    }
    Ok(token)
}
