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
