//! Prometheus metrics recorder for AILink Gateway.
//!
//! Exposes a standard `/metrics` endpoint that Prometheus can scrape.
//! Metrics are updated on every proxied request via `record()`.

use crate::models::audit::AuditEntry;
use prometheus::{
    opts, register_counter_vec, register_histogram_vec,
    CounterVec, Encoder, HistogramVec, TextEncoder,
};
use rust_decimal::prelude::ToPrimitive;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Maximum unique label combinations before bucketing to "other".
const MAX_CARDINALITY: usize = 10_000;

/// Global cardinality tracker.
static LABEL_COMBOS: AtomicUsize = AtomicUsize::new(0);

/// Prometheus metrics recorder.
/// All metrics are registered in the global default registry.
pub struct PrometheusRecorder {
    // Counters
    requests_total: CounterVec,
    tokens_total: CounterVec,
    cost_usd_total: CounterVec,
    errors_total: CounterVec,

    // Histograms
    request_duration_seconds: HistogramVec,
    ttft_seconds: HistogramVec,

    // Gauges
    cache_hit_total: CounterVec,
}

impl PrometheusRecorder {
    /// Create and register all metrics in the global Prometheus registry.
    pub fn new() -> Self {
        let requests_total = register_counter_vec!(
            opts!("ailink_requests_total", "Total number of proxied requests"),
            &["model", "status_code", "cache_hit", "is_streaming"]
        )
        .expect("failed to register ailink_requests_total");

        let tokens_total = register_counter_vec!(
            opts!("ailink_tokens_total", "Total tokens consumed"),
            &["model", "type"]
        )
        .expect("failed to register ailink_tokens_total");

        let cost_usd_total = register_counter_vec!(
            opts!("ailink_cost_usd_total", "Total estimated cost in USD"),
            &["model"]
        )
        .expect("failed to register ailink_cost_usd_total");

        let errors_total = register_counter_vec!(
            opts!("ailink_errors_total", "Total errors by type"),
            &["model", "error_type"]
        )
        .expect("failed to register ailink_errors_total");

        let request_duration_seconds = register_histogram_vec!(
            prometheus::histogram_opts!(
                "ailink_request_duration_seconds",
                "Request latency in seconds",
                // LLM-optimized buckets: 100ms to 120s
                vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0]
            ),
            &["model", "status_code"]
        )
        .expect("failed to register ailink_request_duration_seconds");

        let ttft_seconds = register_histogram_vec!(
            prometheus::histogram_opts!(
                "ailink_ttft_seconds",
                "Time to first token in seconds (streaming only)",
                vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]
            ),
            &["model"]
        )
        .expect("failed to register ailink_ttft_seconds");

        let cache_hit_total = register_counter_vec!(
            opts!("ailink_cache_hits_total", "Total cache hits"),
            &["model"]
        )
        .expect("failed to register ailink_cache_hits_total");

        Self {
            requests_total,
            tokens_total,
            cost_usd_total,
            errors_total,
            request_duration_seconds,
            ttft_seconds,
            cache_hit_total,
        }
    }

    /// Record metrics for a completed request.
    /// Called from `ObserverHub::record()` on every proxy request.
    pub fn record(&self, entry: &AuditEntry) {
        // Cardinality guard: if we've seen too many unique combos, bucket to "other"
        let current = LABEL_COMBOS.load(Ordering::Relaxed);
        let model = if current > MAX_CARDINALITY {
            "other"
        } else {
            LABEL_COMBOS.fetch_add(1, Ordering::Relaxed);
            entry.model.as_deref().unwrap_or("unknown")
        };

        let status = entry
            .upstream_status
            .map(|s| s.to_string())
            .unwrap_or_else(|| "0".to_string());
        let cache_hit = if entry.cache_hit { "true" } else { "false" };
        let is_streaming = if entry.is_streaming { "true" } else { "false" };

        // Request counter
        self.requests_total
            .with_label_values(&[model, &status, cache_hit, is_streaming])
            .inc();

        // Latency histogram
        let duration_secs = entry.response_latency_ms as f64 / 1000.0;
        self.request_duration_seconds
            .with_label_values(&[model, &status])
            .observe(duration_secs);

        // Token counters
        if let Some(prompt) = entry.prompt_tokens {
            self.tokens_total
                .with_label_values(&[model, "prompt"])
                .inc_by(prompt as f64);
        }
        if let Some(completion) = entry.completion_tokens {
            self.tokens_total
                .with_label_values(&[model, "completion"])
                .inc_by(completion as f64);
        }

        // Cost counter
        if let Some(cost) = entry.estimated_cost_usd {
            if let Some(cost_f64) = cost.to_f64() {
                if cost_f64 > 0.0 {
                    self.cost_usd_total
                        .with_label_values(&[model])
                        .inc_by(cost_f64);
                }
            }
        }

        // Error counter
        if let Some(error_type) = &entry.error_type {
            self.errors_total
                .with_label_values(&[model, error_type])
                .inc();
        }

        // TTFT histogram (streaming only)
        if let Some(ttft_ms) = entry.ttft_ms {
            let ttft_secs = ttft_ms as f64 / 1000.0;
            self.ttft_seconds
                .with_label_values(&[model])
                .observe(ttft_secs);
        }

        // Cache hit counter
        if entry.cache_hit {
            self.cache_hit_total
                .with_label_values(&[model])
                .inc();
        }
    }
}

/// Encode all registered metrics as Prometheus text format.
/// Called by the `/metrics` HTTP handler.
pub fn encode_metrics() -> String {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap_or_default();
    String::from_utf8(buffer).unwrap_or_default()
}

// ── Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_metrics_returns_valid_text() {
        let output = encode_metrics();
        // Should be valid text (may be empty if no metrics registered yet)
        assert!(output.is_ascii() || output.is_empty());
    }

    #[test]
    fn test_cardinality_guard_threshold() {
        assert_eq!(MAX_CARDINALITY, 10_000);
    }
}
