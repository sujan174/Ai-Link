/// HTTP client for forwarding requests to upstream APIs.
/// Uses reqwest-middleware for retries and tracing.
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use std::time::Duration;

pub struct UpstreamClient {
    client: ClientWithMiddleware,
}

impl UpstreamClient {
    pub fn new() -> Self {
        // Base HTTP client
        let reqwest_client = reqwest::Client::builder()
            .use_rustls_tls()
            .pool_max_idle_per_host(32)
            .timeout(Duration::from_secs(60)) // Total timeout including retries
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("failed to build HTTP client");

        // Retry Policy: Exponential Backoff
        // Retries: 3 times
        // Base: 500ms
        // Max: 10s
        let retry_policy = ExponentialBackoff::builder().build_with_max_retries(3);

        // Wrap with middleware
        let client = ClientBuilder::new(reqwest_client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Self { client }
    }

    pub async fn forward(
        &self,
        method: reqwest::Method,
        url: &str,
        headers: reqwest::header::HeaderMap,
        body: Vec<u8>,
    ) -> Result<reqwest::Response, crate::errors::AppError> {
        let resp = self
            .client
            .request(method, url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|e| {
                // reqwest-middleware errors are compound, but to_string() gives details
                tracing::warn!("Upstream request failed after retries: {}", e);
                crate::errors::AppError::Upstream(e.to_string())
            })?;

        Ok(resp)
    }
}
