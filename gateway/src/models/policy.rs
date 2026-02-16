use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Policy {
    pub id: Uuid,
    pub name: String,
    pub mode: PolicyMode,
    pub rules: Vec<Rule>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PolicyMode {
    Enforce,
    Shadow,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Rule {
    MethodWhitelist {
        methods: Vec<String>,
    },
    PathWhitelist {
        patterns: Vec<String>,
    },
    RateLimit {
        window: String,
        max_requests: u64,
    },
    SpendCap {
        window: String,
        max_usd: f64,
    },
    HumanApproval {
        timeout: String,
        fallback: String,
    },
    TimeWindow {
        timezone: String,
        allow: Vec<TimeSlot>,
    },
    IpAllowlist {
        cidrs: Vec<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimeSlot {
    pub days: Vec<String>,
    pub hours: (String, String),
}
