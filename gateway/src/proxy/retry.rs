use crate::models::policy::RetryConfig;
use anyhow::{Context, Result};
use bytes::Bytes;
use rand::Rng;
use reqwest::{Client, Method, RequestBuilder, Response};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn};

/// Execute a request with configurable retries, backoff, jitter, and Retry-After support.
pub async fn robust_request(
    client: &Client,
    method: Method,
    url: &str,
    headers: reqwest::header::HeaderMap,
    body: Bytes,
    config: &RetryConfig,
) -> Result<Response> {
    let mut attempt = 0;

    loop {
        attempt += 1;

        // Clone headers and body for this attempt
        let req_builder = client
            .request(method.clone(), url)
            .headers(headers.clone())
            .body(body.clone());

        match execute_attempt(req_builder).await {
            Ok(response) => {
                let status = response.status();
                
                // If success (not a retryable error code), return immediately
                if !config.status_codes.contains(&status.as_u16()) {
                    return Ok(response);
                }

                // If we've exhausted retries, return the last response (even if error)
                if attempt > config.max_retries {
                    debug!(
                        "Exhausted {} retries for {} {}; last status: {}",
                        config.max_retries, method, url, status
                    );
                    return Ok(response);
                }

                // Calculate wait time
                let wait_duration = calculate_wait_time(&response, config, attempt);
                
                warn!(
                    "Attempt {}/{} failed with status {}. Retrying in {:?}...",
                    attempt,
                    config.max_retries + 1,
                    status,
                    wait_duration
                );

                sleep(wait_duration).await;
            }
            Err(e) => {
                // Network errors (DNS, connection refined) are always retryable
                if attempt > config.max_retries {
                    return Err(e).context(format!("Request failed after {} attempts", attempt));
                }

                let wait_duration = calculate_backoff(config, attempt);
                warn!(
                    "Attempt {}/{} failed with error: {}. Retrying in {:?}...",
                    attempt,
                    config.max_retries + 1,
                    e,
                    wait_duration
                );

                sleep(wait_duration).await;
            }
        }
    }
}

async fn execute_attempt(builder: RequestBuilder) -> Result<Response> {
    builder.send().await.map_err(|e| e.into())
}

fn calculate_wait_time(response: &Response, config: &RetryConfig, attempt: u32) -> Duration {
    // 1. Check Retry-After header
    if let Some(retry_after) = response.headers().get(reqwest::header::RETRY_AFTER) {
        if let Ok(retry_after_str) = retry_after.to_str() {
            // Try parsing as seconds
            if let Ok(seconds) = retry_after_str.parse::<u64>() {
                return Duration::from_secs(seconds);
            }
            // Try parsing as HTTP Date
            // if let Ok(date) = humantime::parse_rfc3339(retry_after_str) {
                 // For simplicity in this v1, fallback to backoff if date parsing fails/is complex
            // }
        }
    }

    // 2. Fallback to Exponential Backoff
    calculate_backoff(config, attempt)
}

fn calculate_backoff(config: &RetryConfig, attempt: u32) -> Duration {
    let base = config.base_backoff_ms as f64;
    let max = config.max_backoff_ms as f64;
    
    // Exponential: base * 2^(attempt - 1)
    let raw_backoff = base * 2_f64.powi((attempt as i32) - 1);
    let capped_backoff = raw_backoff.min(max);

    // Jitter: random between 0 and jitter_ms
    let jitter = rand::thread_rng().gen_range(0..=config.jitter_ms);
    
    Duration::from_millis((capped_backoff as u64) + jitter)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_retry_on_500_succeeds() {
        let mock_server = MockServer::start().await;
        
        // Fail twice with 500, then succeed
        Mock::given(method("GET"))
            .and(path("/test"))
            .respond_with(ResponseTemplate::new(500))
            .up_to_n_times(2)
            .mount(&mock_server)
            .await;

        Mock::given(method("GET"))
            .and(path("/test"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&mock_server)
            .await;

        let client = Client::new();
        let config = RetryConfig::default(); // 3 retries
        
        let res = robust_request(
            &client,
            Method::GET,
            &format!("{}/test", mock_server.uri()),
            reqwest::header::HeaderMap::new(),
            Bytes::new(),
            &config
        ).await.unwrap();

        assert_eq!(res.status(), 200);
    }
}
