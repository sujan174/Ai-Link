use dashmap::DashMap;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;

/// Two-tier cache: in-memory DashMap (tier 1) backed by Redis (tier 2).
/// PG is the source of truth (tier 3) but handled by callers.
pub struct TieredCache {
    local: Arc<DashMap<String, String>>,
    redis: ConnectionManager,
}

impl TieredCache {
    pub fn new(redis: ConnectionManager) -> Self {
        Self {
            local: Arc::new(DashMap::new()),
            redis,
        }
    }

    pub fn redis(&self) -> ConnectionManager {
        self.redis.clone()
    }

    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        // tier 1: in-memory
        if let Some(entry) = self.local.get(key) {
            return serde_json::from_str(entry.value()).ok();
        }

        // tier 2: redis
        let mut conn = self.redis.clone();
        if let Ok(val) = conn.get::<_, Option<String>>(key).await {
            if let Some(v) = val {
                self.local.insert(key.to_string(), v.clone());
                return serde_json::from_str(&v).ok();
            }
        }

        None
    }

    pub async fn set<T: Serialize>(
        &self,
        key: &str,
        value: &T,
        ttl_secs: u64,
    ) -> anyhow::Result<()> {
        let json = serde_json::to_string(value)?;
        self.local.insert(key.to_string(), json.clone());

        let mut conn = self.redis.clone();
        conn.set_ex::<_, _, ()>(key, json, ttl_secs).await?;
        Ok(())
    }

    pub fn invalidate_local(&self, key: &str) {
        self.local.remove(key);
    }

    pub async fn increment(&self, key: &str, window_secs: u64) -> anyhow::Result<u64> {
        let mut conn = self.redis.clone();
        // Atomic INCR + EXPIRE
        let script = redis::Script::new(
            r#"
            local current = redis.call("INCR", KEYS[1])
            if current == 1 then
                redis.call("EXPIRE", KEYS[1], ARGV[1])
            end
            return current
        "#,
        );
        let count: u64 = script
            .key(key)
            .arg(window_secs)
            .invoke_async(&mut conn)
            .await?;
        Ok(count)
    }
}
