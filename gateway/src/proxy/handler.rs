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
use crate::middleware::fields::RequestContext;
use crate::models::cost::{self, extract_model, extract_usage};
use crate::models::policy::Action;
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

    // TEST HOOK: Extract cost override header (only when AILINK_ENABLE_TEST_HOOKS=1)
    let test_cost_override = if std::env::var("AILINK_ENABLE_TEST_HOOKS").unwrap_or_default() == "1" {
        headers
            .get("X-AILink-Test-Cost")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| rust_decimal::Decimal::from_str(s).ok())
    } else {
        None
    };

    // ── Phase 4: Attribution headers ──────────────────────────
    let user_id = headers
        .get("x-user-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let external_request_id = headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

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

    // -- 3. Load policies --
    let path = uri.path().to_string();

    let policies = state
        .db
        .get_policies_for_token(&token.policy_ids)
        .await
        .map_err(AppError::Internal)?;

    // -- 3.1 Parse request body as JSON (for body inspection) --
    let mut parsed_body: Option<serde_json::Value> = if !body.is_empty() {
        serde_json::from_slice(&body).ok()
    } else {
        None
    };

    // -- 3.2 Evaluate PRE-FLIGHT policies --
    // Load usage counters from Redis for condition evaluation
    let usage_counters = {
        let mut counters = std::collections::HashMap::new();
        let mut conn = state.cache.redis();
        let now = chrono::Utc::now();

        let spend_daily_key = format!("spend:{}:daily:{}", token.id, now.format("%Y-%m-%d"));
        let spend_monthly_key = format!("spend:{}:monthly:{}", token.id, now.format("%Y-%m"));

        // Request counting keys
        let req_daily_key = format!("req:{}:daily:{}", token.id, now.format("%Y-%m-%d"));
        let req_hourly_key = format!("req:{}:hourly:{}", token.id, now.format("%Y-%m-%d:%H"));

        // Pipeline:
        // 1. Get Spend (Daily + Monthly)
        // 2. Incr Requests (Daily + Hourly)
        // We use a pipeline to minimize RTT.
        let mut pipe = redis::pipe();
        pipe.get(&spend_daily_key)
            .get(&spend_monthly_key)
            .incr(&req_daily_key, 1)
            .expire(&req_daily_key, 90000)
            .ignore() // Daily + buffer
            .incr(&req_hourly_key, 1)
            .expire(&req_hourly_key, 4000)
            .ignore(); // Hourly + buffer

        let (spend_daily, spend_monthly, req_daily, req_hourly): (
            Option<f64>,
            Option<f64>,
            u64,
            u64,
        ) = pipe
            .query_async(&mut conn)
            .await
            .unwrap_or((None, None, 0, 0));

        if let Some(v) = spend_daily {
            counters.insert("spend_today_usd".to_string(), v);
        }
        if let Some(v) = spend_monthly {
            counters.insert("spend_month_usd".to_string(), v);
        }

        counters.insert("requests_today".to_string(), req_daily as f64);
        counters.insert("requests_this_hour".to_string(), req_hourly as f64);

        counters
    };

    // Extract client IP from X-Forwarded-For or X-Real-IP
    let client_ip_str = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string());

    // Scope the RequestContext borrow so we can mutate parsed_body after evaluation
    let (outcome_actions, shadow_violations) = {
        let ctx = RequestContext {
            method: &method,
            path: &path,
            uri: &uri,
            headers: &headers,
            body: parsed_body.as_ref(),
            body_size: body.len(),
            agent_name: agent_name.as_deref(),
            token_id: &token.id,
            token_name: &token.name,
            project_id: &token.project_id.to_string(),
            client_ip: client_ip_str.as_deref(),
            response_status: None,
            response_body: None,
            response_headers: None,
            usage: usage_counters.clone(),
        };

        let outcome = middleware::policy::evaluate_pre_flight(&policies, &ctx);
        (outcome.actions, outcome.shadow_violations)
    };
    // ctx is now dropped — parsed_body can be mutated

    let mut shadow_violations = shadow_violations;

    // -- 3.3 Execute enforced actions --
    let mut hitl_required = false;
    let mut hitl_decision = None;
    let mut hitl_timeout_str = "30m".to_string();
    let mut hitl_latency_ms = None;
    let mut header_mutations = middleware::redact::HeaderMutations::default();
    let mut redacted_by_policy: Vec<String> = Vec::new();

    for triggered in &outcome_actions {
        match &triggered.action {
            // ── Allow ──
            Action::Allow => {
                // No-op
            }
            // ── Deny ──
            Action::Deny { status: _, message } => {
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
                        policy: triggered.policy_name.clone(),
                        reason: message.clone(),
                    },
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
                    // Phase 4: no body/tokens for early deny
                    0, None, None, None, None, None, None, None, None,
                    user_id.clone(), tenant_id.clone(), external_request_id.clone(),
                );
                
                // Phase 5: Emit notification
                let state_clone = state.clone();
                let project_id = token.project_id;
                let title = format!("Policy Violation: {}", triggered.policy_name);
                let body = message.clone();
                tokio::spawn(async move {
                    let _ = state_clone
                        .db
                        .create_notification(
                            project_id,
                            "policy_violation",
                            &title,
                            Some(&body),
                            None,
                        )
                        .await;
                });

                return Err(AppError::PolicyDenied {
                    policy: triggered.policy_name.clone(),
                    reason: message.clone(),
                });
            }

            // ── Rate Limit ──
            Action::RateLimit {
                window,
                max_requests,
                key,
            } => {
                let rl_key = match key {
                    crate::models::policy::RateLimitKey::PerToken => format!("rl:tok:{}", token.id),
                    crate::models::policy::RateLimitKey::PerAgent => {
                        format!("rl:agent:{}", agent_name.as_deref().unwrap_or("unknown"))
                    }
                    crate::models::policy::RateLimitKey::PerIp => format!(
                        "rl:ip:{}",
                        client_ip_str.as_deref().unwrap_or("unknown")
                    ),
                    crate::models::policy::RateLimitKey::PerUser => format!(
                        "rl:user:{}",
                        user_id.as_deref().unwrap_or(&token.id)
                    ),
                    crate::models::policy::RateLimitKey::Global => "rl:global".to_string(),
                };
                let window_secs = middleware::policy::parse_window_secs(window).unwrap_or(60);
                let count = state
                    .cache
                    .increment(&rl_key, window_secs)
                    .await
                    .map_err(AppError::Internal)?;

                if count > *max_requests {
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
                            policy: triggered.policy_name.clone(),
                            reason: "rate limit exceeded".to_string(),
                        },
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
                        // Phase 4: no body/tokens for rate limit deny
                        0, None, None, None, None, None, None, None, None,
                        user_id.clone(), tenant_id.clone(), external_request_id.clone(),
                    );

                    // Phase 5: Emit notification
                    let state_clone = state.clone();
                    let project_id = token.project_id;
                    let title = format!("Rate Limit Exceeded: {}", triggered.policy_name);
                    let body = format!("Limit of {} requests per {}s reached", max_requests, window_secs);
                    tokio::spawn(async move {
                        let _ = state_clone
                            .db
                            .create_notification(
                                project_id,
                                "rate_limit_exceeded",
                                &title,
                                Some(&body),
                                None,
                            )
                            .await;
                    });

                    return Err(AppError::RateLimitExceeded);
                }
            }

            // ── Override (body mutation) ──
            Action::Override { set_body_fields } => {
                if let Some(ref mut body_val) = parsed_body {
                    if let Some(obj) = body_val.as_object_mut() {
                        for (k, v) in set_body_fields {
                            obj.insert(k.clone(), v.clone());
                        }
                        tracing::info!(
                            policy = %triggered.policy_name,
                            fields = ?set_body_fields.keys().collect::<Vec<_>>(),
                            "applied body overrides"
                        );
                    }
                }
            }

            // ── Throttle ──
            Action::Throttle { delay_ms } => {
                tracing::info!(delay_ms = delay_ms, policy = %triggered.policy_name, "throttling request");
                tokio::time::sleep(Duration::from_millis(*delay_ms)).await;
            }

            // ── HITL (handled below after all other pre-flight checks) ──
            Action::RequireApproval { timeout, .. } => {
                hitl_required = true;
                hitl_timeout_str = timeout.clone();
            }

            // ── Log ──
            Action::Log { level, tags } => match level.as_str() {
                "error" => {
                    tracing::error!(policy = %triggered.policy_name, tags = ?tags, "policy log")
                }
                "warn" => {
                    tracing::warn!(policy = %triggered.policy_name, tags = ?tags, "policy log")
                }
                _ => tracing::info!(policy = %triggered.policy_name, tags = ?tags, "policy log"),
            },

            // ── Tag (stored in audit) ──
            Action::Tag { key, value } => {
                tracing::info!(
                    policy = %triggered.policy_name,
                    tag_key = %key, tag_value = %value,
                    "policy tag"
                );
            }

            // ── Webhook (fire & forget for now) ──
            Action::Webhook {
                url, timeout_ms, ..
            } => {
                let url = url.clone();
                let timeout_ms = *timeout_ms;
                let summary = serde_json::json!({
                    "policy": triggered.policy_name,
                    "method": method.to_string(),
                    "path": path,
                    "agent": agent_name,
                    "token_id": token.id,
                });
                tokio::spawn(async move {
                    let client = reqwest::Client::new();
                    let _ = client
                        .post(&url)
                        .timeout(Duration::from_millis(timeout_ms))
                        .json(&summary)
                        .send()
                        .await;
                });
            }

            // ── Redact (pre-flight, request-side) ──
            Action::Redact { .. } => {
                if let Some(ref mut body_val) = parsed_body {
                    let matched =
                        middleware::redact::apply_redact(body_val, &triggered.action, true);
                    if !matched.is_empty() {
                        tracing::info!(
                            policy = %triggered.policy_name,
                            patterns = ?matched,
                            "applied request-side redaction"
                        );
                        redacted_by_policy.extend(matched);
                    }
                }
            }

            // ── Transform ──
            Action::Transform { operations } => {
                for op in operations {
                    if let Some(ref mut body_val) = parsed_body {
                        middleware::redact::apply_transform(body_val, &mut header_mutations, op);
                    } else {
                        // No body, but we can still do header transforms
                        let mut empty = serde_json::Value::Null;
                        middleware::redact::apply_transform(&mut empty, &mut header_mutations, op);
                    }
                }
                tracing::info!(
                    policy = %triggered.policy_name,
                    ops = operations.len(),
                    "applied transform operations"
                );
            }
        }
    }

    // -- 3.5 Check Spend Cap (legacy, still uses old middleware) --
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
            // Phase 4: no body/tokens for spend cap deny
            0, None, None, None, None, None, None, None, None,
            user_id.clone(), tenant_id.clone(), external_request_id.clone(),
        );
        return Err(AppError::SpendCapReached);
    }

    // -- 3.6 Handle HITL --
    if hitl_required {
        let hitl_start = Instant::now();

        // Create approval request
        let summary = serde_json::json!({
            "method": method.to_string(),
            "path": path,
            "agent": agent_name,
            "upstream": token.upstream_url,
            "body_preview": parsed_body.as_ref().map(|b| {
                let s = b.to_string();
                if s.len() > 500 { format!("{}...", &s[..500]) } else { s }
            }),
        });

        // Expiry: 10 minutes (can be overridden by policy timeout later)
        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(10);

        let approval_id = state
            .db
            .create_approval_request(
                &token.id,
                token.project_id,
                idempotency_key.clone(),
                summary.clone(),
                expires_at,
            )
            .await
            .map_err(AppError::Internal)?;

        // Phase 5: Emit notification
        let state_clone = state.clone();
        let project_id = token.project_id;
        let title = "Approval Required".to_string();
        let body = format!("Request to {} requires approval.", path);
        let metadata = serde_json::json!({ "approval_id": approval_id });
        tokio::spawn(async move {
            let _ = state_clone
                .db
                .create_notification(
                    project_id,
                    "approval_needed",
                    &title,
                    Some(&body),
                    Some(metadata),
                )
                .await;
        });

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

        let timeout_secs = middleware::policy::parse_window_secs(&hitl_timeout_str).unwrap_or(1800); // default 30m

        // Poll for status
        let mut approved = false;
        for _ in 0..timeout_secs {
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
                        // Phase 4: no body/tokens for HITL rejected
                        0, None, None, None, None, None, None, None, None,
                        user_id.clone(), tenant_id.clone(), external_request_id.clone(),
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
                        // Phase 4: no body/tokens for HITL expired
                        0, None, None, None, None, None, None, None, None,
                        user_id.clone(), tenant_id.clone(), external_request_id.clone(),
                    );
                    return Err(AppError::ApprovalTimeout);
                }
                _ => {
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
                // Phase 4: no body/tokens for HITL timeout
                0, None, None, None, None, None, None, None, None,
                user_id.clone(), tenant_id.clone(), external_request_id.clone(),
            );
            return Err(AppError::ApprovalTimeout);
        }

        hitl_latency_ms = Some(hitl_start.elapsed().as_millis() as i32);
    }

    // -- 4. Resolve credential + upstream URL --
    // Service Registry: if path starts with /v1/proxy/services/{name}/...,
    // dynamically resolve the service and use its credential + base_url.
    let service_prefix = "/v1/proxy/services/";
    let (effective_credential_id, effective_upstream_url, effective_path) =
        if path.starts_with(service_prefix) {
            let rest = &path[service_prefix.len()..]; // "stripe/v1/charges"
            let (svc_name, remaining_path) = match rest.find('/') {
                Some(pos) => (&rest[..pos], &rest[pos..]),         // ("stripe", "/v1/charges")
                None => (rest, "/"),                                // ("stripe", "/")
            };

            let service = state
                .db
                .get_service_by_name(token.project_id, svc_name)
                .await
                .map_err(AppError::Internal)?
                .ok_or_else(|| {
                    AppError::Upstream(format!("Service not found: {}", svc_name))
                })?;

            let cred_id = service.credential_id.ok_or_else(|| {
                AppError::Internal(anyhow::anyhow!(
                    "Service '{}' has no credential configured",
                    svc_name
                ))
            })?;

            (cred_id, service.base_url.clone(), remaining_path.to_string())
        } else {
            // Legacy path: use token's credential + upstream_url
            (token.credential_id, token.upstream_url.clone(), path.clone())
        };

    let (mut real_key, _provider, injection_mode, injection_header) = state
        .vault
        .retrieve(&effective_credential_id.to_string())
        .await
        .map_err(AppError::Internal)?;

    // -- 5. Build upstream request --
    let upstream_url = proxy::transform::rewrite_url(&effective_upstream_url, &effective_path);

    // Use modified body if overrides were applied, otherwise original
    let final_body = if let Some(ref modified) = parsed_body {
        // Check if body was modified by Override action
        serde_json::to_vec(modified).unwrap_or_else(|_| body.to_vec())
    } else {
        body.to_vec()
    };

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
            use base64::Engine;
            let encoded = base64::engine::general_purpose::STANDARD.encode(&real_key);
            upstream_headers.insert(
                header_name,
                reqwest::header::HeaderValue::from_str(&format!("Basic {}", encoded))
                    .map_err(|_| AppError::Internal(anyhow::anyhow!("invalid key format")))?,
            );
        }
        "header" => {
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

    // Apply transform header mutations (SetHeader / RemoveHeader)
    for name in &header_mutations.removals {
        if let Ok(header_name) = name.parse::<reqwest::header::HeaderName>() {
            upstream_headers.remove(header_name);
        }
    }
    for (name, value) in &header_mutations.inserts {
        if let (Ok(header_name), Ok(header_value)) = (
            name.parse::<reqwest::header::HeaderName>(),
            reqwest::header::HeaderValue::from_str(value),
        ) {
            upstream_headers.insert(header_name, header_value);
        }
    }

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

    // Zero the decrypted key from memory
    {
        use zeroize::Zeroize;
        real_key.zeroize();
    }

    // -- 5.1 Resolve Retry Config --
    // Use the first policy that specifies a retry config, or default
    let retry_config = policies
        .iter()
        .find_map(|p| p.retry.clone())
        .unwrap_or_default();

    // Forward with explicit timeout safety — scale for retries
    let safety_secs = 65 + (retry_config.max_retries as u64 * (retry_config.max_backoff_ms / 1000 + 65));
    let upstream_resp = match tokio::time::timeout(
        Duration::from_secs(safety_secs),
        state.upstream_client.forward(
            reqwest_method,
            &final_upstream_url,
            upstream_headers,
            bytes::Bytes::from(final_body),
            &retry_config,
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
                // Phase 4: no body/tokens for upstream failure
                0, None, None, None, None, None, None, None, None,
                user_id.clone(), tenant_id.clone(), external_request_id.clone(),
            );
            return Err(e);
        }
        Err(_) => {
            tracing::error!("Upstream request timed out (safety net)");
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
                // Phase 4: no body/tokens for upstream timeout
                0, None, None, None, None, None, None, None, None,
                user_id, tenant_id, external_request_id,
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

    // -- 5.5 Post-flight policy evaluation --
    let mut resp_body_vec = resp_body.to_vec();
    let parsed_resp_body: Option<serde_json::Value> = serde_json::from_slice(&resp_body_vec).ok();

    // Convert reqwest headers to axum headers for RequestContext
    let axum_resp_headers = {
        let mut h = HeaderMap::new();
        for (key, value) in resp_headers.iter() {
            if let Ok(name) = axum::http::HeaderName::from_bytes(key.as_str().as_bytes()) {
                if let Ok(val) = axum::http::HeaderValue::from_bytes(value.as_bytes()) {
                    h.insert(name, val);
                }
            }
        }
        h
    };

    {
        let project_id_str = token.project_id.to_string();
        let post_ctx = RequestContext {
            method: &method,
            path: &path,
            uri: &uri,
            headers: &headers,
            body: parsed_body.as_ref(),
            body_size: body.len(),
            agent_name: agent_name.as_deref(),
            token_id: &token.id,
            token_name: &token.name,
            project_id: &project_id_str,
            client_ip: client_ip_str.as_deref(),
            response_status: Some(status.as_u16()),
            response_body: parsed_resp_body.as_ref(),
            response_headers: Some(&axum_resp_headers),
            usage: usage_counters,
        };

        let post_outcome = middleware::policy::evaluate_post_flight(&policies, &post_ctx);

        // Execute post-flight actions
        for triggered in &post_outcome.actions {
            match &triggered.action {
                Action::Deny { message, .. } => {
                    tracing::warn!(
                        policy = %triggered.policy_name,
                        "post-flight deny: suppressing unsafe response"
                    );
                    return Err(AppError::PolicyDenied {
                        policy: triggered.policy_name.clone(),
                        reason: message.clone(),
                    });
                }
                Action::Redact { .. } => {
                    if let Some(mut resp_json) = parsed_resp_body.clone() {
                        let matched = middleware::redact::apply_redact(
                            &mut resp_json,
                            &triggered.action,
                            false,
                        );
                        if !matched.is_empty() {
                            tracing::info!(
                                policy = %triggered.policy_name,
                                patterns = ?matched,
                                "applied response-side redaction"
                            );
                            redacted_by_policy.extend(matched);
                            // Reserialize the redacted response body
                            if let Ok(new_body) = serde_json::to_vec(&resp_json) {
                                resp_body_vec = new_body;
                            }
                        }
                    }
                }
                Action::Log { level, tags } => match level.as_str() {
                    "error" => {
                        tracing::error!(policy = %triggered.policy_name, tags = ?tags, "post-flight policy log")
                    }
                    "warn" => {
                        tracing::warn!(policy = %triggered.policy_name, tags = ?tags, "post-flight policy log")
                    }
                    _ => {
                        tracing::info!(policy = %triggered.policy_name, tags = ?tags, "post-flight policy log")
                    }
                },
                Action::Tag { key, value } => {
                    tracing::info!(
                        policy = %triggered.policy_name,
                        tag_key = %key, tag_value = %value,
                        "post-flight policy tag"
                    );
                }
                Action::Webhook {
                    url, timeout_ms, ..
                } => {
                    let url = url.clone();
                    let timeout_ms = *timeout_ms;
                    let summary = serde_json::json!({
                        "phase": "post",
                        "policy": triggered.policy_name,
                        "response_status": status.as_u16(),
                    });
                    tokio::spawn(async move {
                        let client = reqwest::Client::new();
                        let _ = client
                            .post(&url)
                            .timeout(Duration::from_millis(timeout_ms))
                            .json(&summary)
                            .send()
                            .await;
                    });
                }
                _ => {
                    tracing::debug!(
                        policy = %triggered.policy_name,
                        action = ?triggered.action,
                        "post-flight action not applicable"
                    );
                }
            }
        }

        // Collect post-flight shadow violations
        if !post_outcome.shadow_violations.is_empty() {
            shadow_violations.extend(post_outcome.shadow_violations);
        }
    }

    // -- 6. Sanitize response --
    let content_type = resp_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");
    let sanitization_result = middleware::sanitize::sanitize_response(&resp_body_vec, content_type);
    let sanitized_body = sanitization_result.body;

    // -- 6.1 Calculate Cost & Update Spend --
    let mut estimated_cost_usd = None;
    let mut audit_prompt_tokens: Option<u32> = None;
    let mut audit_completion_tokens: Option<u32> = None;
    let mut audit_model: Option<String> = None;

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
                audit_prompt_tokens = Some(input);
                audit_completion_tokens = Some(output);
                let model = extract_model(&sanitized_body).unwrap_or("unknown".to_string());
                audit_model = Some(model.clone());
                let provider = if token.upstream_url.contains("anthropic") {
                    "anthropic"
                } else {
                    "openai"
                };
                let final_cost = cost::calculate_cost(provider, &model, input, output);

                if !final_cost.is_zero() {
                    estimated_cost_usd = Some(final_cost);
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
            Ok(None) => {}
            Err(e) => tracing::warn!("Failed to extract usage: {}", e),
        }
    }

    // ── Phase 4: Calculate TPS ────────────────────────────────
    let elapsed_secs = start.elapsed().as_secs_f32();
    let tokens_per_second = audit_completion_tokens.map(|ct| {
        if elapsed_secs > 0.0 { ct as f32 / elapsed_secs } else { 0.0 }
    });

    // ── Phase 4: Privacy-gated body capture ───────────────────
    let log_level = token.log_level as u8;
    let (logged_req_body, logged_resp_body, logged_req_headers, logged_resp_headers) = match log_level {
        0 => (None, None, None, None),
        1 => {
            // Level 1: Run PII scrubbers on bodies
            let req = middleware::redact::redact_for_logging(&parsed_body);
            let resp = middleware::redact::redact_for_logging(&parsed_resp_body);
            (req, resp, None, None)
        }
        2 => {
            // Level 2: Full debug — store raw bodies + headers (auto-expires in 24h)
            let req = parsed_body.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
            let resp = parsed_resp_body.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
            let req_hdrs = Some(headers_to_json(&headers));
            let resp_hdrs = Some(headers_to_json_reqwest(&resp_headers));
            (req, resp, req_hdrs, resp_hdrs)
        }
        _ => (None, None, None, None),
    };

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
        // Phase 4 fields
        log_level,
        logged_req_body,
        logged_resp_body,
        logged_req_headers,
        logged_resp_headers,
        audit_prompt_tokens,
        audit_completion_tokens,
        audit_model,
        tokens_per_second,
        user_id,
        tenant_id,
        external_request_id,
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
    // Phase 4 fields
    log_level: u8,
    request_body: Option<String>,
    response_body: Option<String>,
    request_headers: Option<serde_json::Value>,
    response_headers: Option<serde_json::Value>,
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    model: Option<String>,
    tokens_per_second: Option<f32>,
    user_id: Option<String>,
    tenant_id: Option<String>,
    external_request_id: Option<String>,
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
        // Phase 4 observability
        log_level,
        request_body,
        response_body,
        request_headers,
        response_headers,
        prompt_tokens,
        completion_tokens,
        model,
        tokens_per_second,
        user_id,
        tenant_id,
        external_request_id,
    };
    middleware::audit::log_async(state.db.pool().clone(), entry);
}

/// Convert axum HeaderMap to JSON object for Level 2 logging.
fn headers_to_json(headers: &HeaderMap) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (key, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            // Skip authorization to never log real credentials
            if key.as_str().eq_ignore_ascii_case("authorization") {
                map.insert(key.to_string(), serde_json::json!("[REDACTED]"));
            } else {
                map.insert(key.to_string(), serde_json::json!(v));
            }
        }
    }
    serde_json::Value::Object(map)
}

/// Convert reqwest HeaderMap to JSON object for Level 2 logging.
fn headers_to_json_reqwest(headers: &reqwest::header::HeaderMap) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (key, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            map.insert(key.to_string(), serde_json::json!(v));
        }
    }
    serde_json::Value::Object(map)
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
