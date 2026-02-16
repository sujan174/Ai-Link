use crate::cache::TieredCache;
use crate::errors::AppError;
use crate::models::policy::{Policy, PolicyMode, Rule};

/// Redis-backed rate limiter.
///
/// Iterates through policies. If a RateLimit rule is found, increments a Redis counter.
/// If count > max_requests, returns error.
///
/// Supported window formats: "1s", "1m", "1h", "1d".
pub async fn check_rate_limits(
    token_id: &str,
    policies: &[Policy],
    cache: &TieredCache,
) -> Result<Vec<String>, AppError> {
    let mut violations = Vec::new();

    for policy in policies {
        for rule in &policy.rules {
            if let Rule::RateLimit {
                window,
                max_requests,
            } = rule
            {
                let window_secs = parse_window(window);
                let key = format!("rate:{}:{}:{}", token_id, policy.id, window_secs);

                let count = cache
                    .increment(&key, window_secs)
                    .await
                    .map_err(AppError::Internal)?;

                if count > *max_requests {
                    match policy.mode {
                        PolicyMode::Enforce => return Err(AppError::RateLimitExceeded),
                        PolicyMode::Shadow => {
                            // Log violation but proceed
                            tracing::warn!(
                                rate_limit = true,
                                token = token_id,
                                policy = %policy.name,
                                limit = max_requests,
                                count = count,
                                "shadow mode: rate limit exceeded"
                            );
                            violations.push(format!(
                                "policy '{}': rate limit exceeded ({} > {})",
                                policy.name, count, max_requests
                            ));
                        }
                    }
                }
            }
        }
    }
    Ok(violations)
}

fn parse_window(s: &str) -> u64 {
    let s = s.trim();
    if let Some(val) = s.strip_suffix('s') {
        val.parse().unwrap_or(60)
    } else if let Some(val) = s.strip_suffix('m') {
        val.parse::<u64>().map(|v| v * 60).unwrap_or(60)
    } else if let Some(val) = s.strip_suffix('h') {
        val.parse::<u64>().map(|v| v * 3600).unwrap_or(60)
    } else if let Some(val) = s.strip_suffix('d') {
        val.parse::<u64>().map(|v| v * 86400).unwrap_or(60)
    } else {
        60 // default 1m
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_window() {
        assert_eq!(parse_window("1s"), 1);
        assert_eq!(parse_window("60s"), 60);
        assert_eq!(parse_window("1m"), 60);
        assert_eq!(parse_window("5m"), 300);
        assert_eq!(parse_window("1h"), 3600);
        assert_eq!(parse_window("24h"), 86400);
        assert_eq!(parse_window("1d"), 86400);
        assert_eq!(parse_window("garbage"), 60); // default
        assert_eq!(parse_window("invalid"), 60); // ends in d, checks parse fail
        assert_eq!(parse_window("  5m  "), 300); // verify trim
    }
}
