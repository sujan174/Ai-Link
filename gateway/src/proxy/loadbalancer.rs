use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

/// An upstream target parsed from the token's `upstreams` JSONB array.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpstreamTarget {
    pub url: String,
    pub credential_id: Option<Uuid>,
    #[serde(default = "default_weight")]
    pub weight: u32,
    #[serde(default = "default_priority")]
    pub priority: u32,
}

fn default_weight() -> u32 { 100 }
fn default_priority() -> u32 { 1 }

/// Health state for a single upstream endpoint.
#[derive(Debug)]
struct UpstreamHealth {
    url: String,
    is_healthy: bool,
    failure_count: u32,
    last_failure: Option<Instant>,
}

/// Configuration for the circuit breaker.
const FAILURE_THRESHOLD: u32 = 3;         // failures before circuit opens
const RECOVERY_COOLDOWN_SECS: u64 = 30;   // seconds before trying an unhealthy upstream again

/// In-memory loadbalancer with circuit-breaker health tracking.
/// Uses weighted round-robin within priority tiers and automatic failover.
pub struct LoadBalancer {
    /// Per-token health status: token_id → Vec<UpstreamHealth>
    health: DashMap<String, Vec<UpstreamHealth>>,
    /// Per-token round-robin counter
    counters: DashMap<String, Arc<AtomicU64>>,
}

impl LoadBalancer {
    pub fn new() -> Self {
        Self {
            health: DashMap::new(),
            counters: DashMap::new(),
        }
    }

    /// Select the best upstream target using weighted round-robin within priority tiers.
    /// Returns the index into the `upstreams` slice, or `None` if all are unhealthy.
    pub fn select(&self, token_id: &str, upstreams: &[UpstreamTarget]) -> Option<usize> {
        tracing::info!(token_id = token_id, upstream_count = upstreams.len(), "LoadBalancer::select called");
        if upstreams.is_empty() {
            return None;
        }
        if upstreams.len() == 1 {
            // Still track health for single-upstream tokens so get_all_status() works
            self.ensure_health(token_id, upstreams);
            return Some(0);
        }

        // Ensure health entries exist
        self.ensure_health(token_id, upstreams);

        // Get health snapshot
        let health = self.health.get(token_id);
        let health_vec = health.as_ref().map(|h| h.value());

        // Find the highest priority tier (lowest number) that has healthy upstreams
        let mut priorities: Vec<u32> = upstreams.iter().map(|u| u.priority).collect();
        priorities.sort();
        priorities.dedup();

        for priority in priorities {
            let candidates: Vec<(usize, &UpstreamTarget)> = upstreams
                .iter()
                .enumerate()
                .filter(|(i, u)| {
                    u.priority == priority && self.is_healthy_at(health_vec, *i, &u.url)
                })
                .collect();

            if candidates.is_empty() {
                continue; // all upstreams at this priority are unhealthy, try next tier
            }

            // Weighted round-robin among candidates
            let counter = self
                .counters
                .entry(token_id.to_string())
                .or_insert_with(|| Arc::new(AtomicU64::new(0)));
            let round = counter.fetch_add(1, Ordering::Relaxed);

            // Build weight table
            let total_weight: u32 = candidates.iter().map(|(_, u)| u.weight).sum();
            if total_weight == 0 {
                return candidates.first().map(|(i, _)| *i);
            }

            let target = (round % total_weight as u64) as u32;
            let mut cumulative = 0u32;
            for (idx, upstream) in &candidates {
                cumulative += upstream.weight;
                if target < cumulative {
                    return Some(*idx);
                }
            }

            // Fallback: first candidate
            return candidates.first().map(|(i, _)| *i);
        }

        // All tiers exhausted — try recovery on highest priority
        // Return the first upstream that has cooled down
        for (i, upstream) in upstreams.iter().enumerate() {
            if self.check_recovery(token_id, &upstream.url) {
                return Some(i);
            }
        }

        None
    }

    /// Mark an upstream as failed. Opens the circuit after FAILURE_THRESHOLD consecutive failures.
    pub fn mark_failed(&self, token_id: &str, url: &str) {
        if let Some(mut healths) = self.health.get_mut(token_id) {
            if let Some(h) = healths.iter_mut().find(|h| h.url == url) {
                h.failure_count += 1;
                h.last_failure = Some(Instant::now());
                if h.failure_count >= FAILURE_THRESHOLD {
                    h.is_healthy = false;
                    tracing::warn!(
                        token_id = token_id,
                        url = url,
                        failures = h.failure_count,
                        "circuit breaker OPENED: upstream marked unhealthy"
                    );
                }
            }
        }
    }

    /// Mark an upstream as healthy. Resets the circuit breaker.
    pub fn mark_healthy(&self, token_id: &str, url: &str) {
        if let Some(mut healths) = self.health.get_mut(token_id) {
            if let Some(h) = healths.iter_mut().find(|h| h.url == url) {
                if !h.is_healthy {
                    tracing::info!(
                        token_id = token_id,
                        url = url,
                        "circuit breaker CLOSED: upstream recovered"
                    );
                }
                h.is_healthy = true;
                h.failure_count = 0;
                h.last_failure = None;
            }
        }
    }

    /// Ensure health entries exist for the token's upstreams.
    fn ensure_health(&self, token_id: &str, upstreams: &[UpstreamTarget]) {
        self.health.entry(token_id.to_string()).or_insert_with(|| {
            tracing::info!(token_id = token_id, "Initializing health map for token");
            upstreams
                .iter()
                .map(|u| UpstreamHealth {
                    url: u.url.clone(),
                    is_healthy: true,
                    failure_count: 0,
                    last_failure: None,
                })
                .collect()
        });
    }

    /// Check if an upstream at a given index is considered healthy.
    fn is_healthy_at(
        &self,
        health_vec: Option<&Vec<UpstreamHealth>>,
        idx: usize,
        url: &str,
    ) -> bool {
        if let Some(healths) = health_vec {
            if let Some(h) = healths.iter().find(|h| h.url == url) {
                if h.is_healthy {
                    return true;
                }
                // Check if cooldown has passed (half-open state)
                if let Some(last) = h.last_failure {
                    if last.elapsed().as_secs() >= RECOVERY_COOLDOWN_SECS {
                        return true; // allow retry (half-open)
                    }
                }
                return false;
            }
        }
        // No health data — assume healthy
        let _ = idx;
        true
    }

    /// Check if an unhealthy upstream has cooled down enough for a recovery attempt.
    fn check_recovery(&self, token_id: &str, url: &str) -> bool {
        if let Some(healths) = self.health.get(token_id) {
            if let Some(h) = healths.iter().find(|h| h.url == url) {
                if let Some(last) = h.last_failure {
                    return last.elapsed().as_secs() >= RECOVERY_COOLDOWN_SECS;
                }
            }
        }
        true
    }
}

/// Parse upstreams from token JSONB. Returns empty vec if null or invalid.
pub fn parse_upstreams(upstreams_json: Option<&serde_json::Value>) -> Vec<UpstreamTarget> {
    match upstreams_json {
        Some(val) => serde_json::from_value::<Vec<UpstreamTarget>>(val.clone()).unwrap_or_default(),
        None => Vec::new(),
    }
}

/// Status snapshot of a single upstream (for dashboard API).
#[derive(Debug, Clone, Serialize)]
pub struct UpstreamStatus {
    pub token_id: String,
    pub url: String,
    pub is_healthy: bool,
    pub failure_count: u32,
    pub cooldown_remaining_secs: Option<u64>,
}

impl LoadBalancer {
    /// Return a snapshot of all tracked upstream health status.
    pub fn get_all_status(&self) -> Vec<UpstreamStatus> {
        tracing::info!(map_size = self.health.len(), "LoadBalancer::get_all_status called");
        let mut statuses = Vec::new();
        for entry in self.health.iter() {
            let token_id = entry.key().clone();
            for h in entry.value().iter() {
                let cooldown = if !h.is_healthy {
                    h.last_failure.map(|lf| {
                        let elapsed = lf.elapsed().as_secs();
                        if elapsed < RECOVERY_COOLDOWN_SECS {
                            RECOVERY_COOLDOWN_SECS - elapsed
                        } else {
                            0
                        }
                    })
                } else {
                    None
                };

                statuses.push(UpstreamStatus {
                    token_id: token_id.clone(),
                    url: h.url.clone(),
                    is_healthy: h.is_healthy,
                    failure_count: h.failure_count,
                    cooldown_remaining_secs: cooldown,
                });
            }
        }
        statuses
    }
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_upstreams(n: usize) -> Vec<UpstreamTarget> {
        (0..n)
            .map(|i| UpstreamTarget {
                url: format!("https://api{}.example.com", i),
                credential_id: None,
                weight: 100,
                priority: 1,
            })
            .collect()
    }

    #[test]
    fn test_select_single_upstream() {
        let lb = LoadBalancer::new();
        let upstreams = make_upstreams(1);
        assert_eq!(lb.select("tok1", &upstreams), Some(0));
    }

    #[test]
    fn test_select_empty_returns_none() {
        let lb = LoadBalancer::new();
        assert_eq!(lb.select("tok1", &[]), None);
    }

    #[test]
    fn test_round_robin_distributes() {
        let lb = LoadBalancer::new();
        let upstreams = make_upstreams(3);
        let mut counts = [0u32; 3];
        for _ in 0..300 {
            if let Some(idx) = lb.select("tok1", &upstreams) {
                counts[idx] += 1;
            }
        }
        // Each should get roughly 100 selections
        for count in &counts {
            assert!(*count > 50, "count {} is too low", count);
        }
    }

    #[test]
    fn test_circuit_breaker_opens_after_failures() {
        let lb = LoadBalancer::new();
        let upstreams = vec![
            UpstreamTarget {
                url: "https://primary.com".into(),
                credential_id: None,
                weight: 100,
                priority: 1,
            },
            UpstreamTarget {
                url: "https://backup.com".into(),
                credential_id: None,
                weight: 100,
                priority: 1,
            },
        ];

        // Warm up health entries
        lb.select("tok1", &upstreams);

        // Fail primary multiple times
        for _ in 0..FAILURE_THRESHOLD {
            lb.mark_failed("tok1", "https://primary.com");
        }

        // Now selections should avoid primary
        let mut primary_count = 0;
        for _ in 0..20 {
            if let Some(idx) = lb.select("tok1", &upstreams) {
                if idx == 0 {
                    primary_count += 1;
                }
            }
        }
        assert_eq!(primary_count, 0, "primary should be avoided after circuit opens");
    }

    #[test]
    fn test_mark_healthy_resets_circuit() {
        let lb = LoadBalancer::new();
        let upstreams = make_upstreams(2);

        lb.select("tok1", &upstreams);

        for _ in 0..FAILURE_THRESHOLD {
            lb.mark_failed("tok1", "https://api0.example.com");
        }

        // Mark healthy again
        lb.mark_healthy("tok1", "https://api0.example.com");

        // Should now be selectable again
        let mut found = false;
        for _ in 0..20 {
            if lb.select("tok1", &upstreams) == Some(0) {
                found = true;
                break;
            }
        }
        assert!(found, "recovered upstream should be selectable");
    }

    #[test]
    fn test_priority_tiers() {
        let lb = LoadBalancer::new();
        let upstreams = vec![
            UpstreamTarget {
                url: "https://primary.com".into(),
                credential_id: None,
                weight: 100,
                priority: 1,
            },
            UpstreamTarget {
                url: "https://backup.com".into(),
                credential_id: None,
                weight: 100,
                priority: 2,  // lower priority (higher number)
            },
        ];

        // Should always prefer priority 1
        for _ in 0..20 {
            assert_eq!(lb.select("tok1", &upstreams), Some(0));
        }
    }

    #[test]
    fn test_failover_to_lower_priority() {
        let lb = LoadBalancer::new();
        let upstreams = vec![
            UpstreamTarget {
                url: "https://primary.com".into(),
                credential_id: None,
                weight: 100,
                priority: 1,
            },
            UpstreamTarget {
                url: "https://backup.com".into(),
                credential_id: None,
                weight: 100,
                priority: 2,
            },
        ];

        lb.select("tok1", &upstreams);

        // Kill primary
        for _ in 0..FAILURE_THRESHOLD {
            lb.mark_failed("tok1", "https://primary.com");
        }

        // Should failover to backup
        assert_eq!(lb.select("tok1", &upstreams), Some(1));
    }

    #[test]
    fn test_weighted_distribution() {
        let lb = LoadBalancer::new();
        let upstreams = vec![
            UpstreamTarget {
                url: "https://heavy.com".into(),
                credential_id: None,
                weight: 70,
                priority: 1,
            },
            UpstreamTarget {
                url: "https://light.com".into(),
                credential_id: None,
                weight: 30,
                priority: 1,
            },
        ];

        let mut counts = [0u32; 2];
        for _ in 0..1000 {
            if let Some(idx) = lb.select("tok1", &upstreams) {
                counts[idx] += 1;
            }
        }

        // Heavy should get ~70% (700 ± 100)
        assert!(counts[0] > 600, "heavy count {} too low", counts[0]);
        assert!(counts[0] < 800, "heavy count {} too high", counts[0]);
    }

    #[test]
    fn test_parse_upstreams_valid() {
        let json = serde_json::json!([
            {"url": "https://api.openai.com", "weight": 70, "priority": 1},
            {"url": "https://backup.openai.com", "weight": 30, "priority": 2}
        ]);
        let upstreams = parse_upstreams(Some(&json));
        assert_eq!(upstreams.len(), 2);
        assert_eq!(upstreams[0].weight, 70);
        assert_eq!(upstreams[1].priority, 2);
    }

    #[test]
    fn test_parse_upstreams_null() {
        assert!(parse_upstreams(None).is_empty());
    }

    #[test]
    fn test_parse_upstreams_invalid() {
        let json = serde_json::json!("not an array");
        assert!(parse_upstreams(Some(&json)).is_empty());
    }
}
