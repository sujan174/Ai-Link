use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct VolumeStat {
    pub bucket: DateTime<Utc>,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct StatusStat {
    pub status_class: i32,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct LatencyStat {
    pub p50: f64,
    pub p90: f64,
    pub p99: f64,
    pub avg: f64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TokenUsageBucket {
    pub bucket: DateTime<Utc>,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsageStats {
    pub total_requests: i64,
    pub success_count: i64,
    pub error_count: i64,
    pub avg_latency_ms: f64,
    pub total_cost_usd: f64,
    pub hourly: Vec<TokenUsageBucket>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AnalyticsSummary {
    pub total_requests: i64,
    pub success_count: i64,
    pub error_count: i64,
    pub avg_latency: f64,
    pub total_cost: f64,
    pub total_tokens: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AnalyticsTimeseriesPoint {
    pub bucket: DateTime<Utc>,
    pub request_count: i64,
    pub error_count: i64,
    pub cost: f64,
    pub lat: f64,
}
