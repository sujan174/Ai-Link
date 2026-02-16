use crate::cache::TieredCache;
use crate::errors::AppError;
use crate::models::policy::Policy;

/// Legacy rate limiter — now largely handled by the policy engine's RateLimit action.
///
/// This function is kept for backward compatibility with the spend/cap middleware
/// but is no longer called from the proxy handler. The new policy engine
/// (`middleware::policy::execute_rate_limit`) handles rate limiting as an action.
#[allow(dead_code)]
pub async fn check_rate_limits(
    _token_id: &str,
    _policies: &[Policy],
    _cache: &TieredCache,
) -> Result<Vec<String>, AppError> {
    // Rate limiting is now handled by the policy engine's RateLimit action.
    // See middleware::policy::execute_rate_limit().
    Ok(vec![])
}

pub fn parse_window(s: &str) -> u64 {
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
        assert_eq!(parse_window("invalid"), 60);
        assert_eq!(parse_window("  5m  "), 300); // verify trim
    }
}
