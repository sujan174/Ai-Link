use dashmap::DashMap;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Entry stored in the local DashMap with an expiry timestamp.
#[derive(Clone)]
pub(crate) struct CacheEntry {
    value: String,
    pub(crate) expires_at: Instant,
}

/// Two-tier cache: in-memory DashMap (tier 1) backed by Redis (tier 2).
/// PG is the source of truth (tier 3) but handled by callers.
///
/// The local tier now honours TTLs: entries are checked on read and
/// evicted lazily.  A background sweep can be triggered with `evict_expired()`.
#[derive(Clone)]
pub struct TieredCache {
    pub(crate) local: Arc<DashMap<String, CacheEntry>>,
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
        // tier 1: in-memory (with TTL check)
        if let Some(entry) = self.local.get(key) {
            if Instant::now() < entry.expires_at {
                return serde_json::from_str(&entry.value).ok();
            }
            // expired — drop the ref before removing
            drop(entry);
            self.local.remove(key);
        }

        // tier 2: redis
        let mut conn = self.redis.clone();
        if let Ok(Some(v)) = conn.get::<_, Option<String>>(key).await {
            // Re-use the Redis TTL for the local entry.
            // Default to 60s if we can't query it.
            let ttl_secs: i64 = conn.ttl(key).await.unwrap_or(60);
            let ttl = if ttl_secs > 0 {
                Duration::from_secs(ttl_secs as u64)
            } else {
                Duration::from_secs(60)
            };
            self.local.insert(
                key.to_string(),
                CacheEntry {
                    value: v.clone(),
                    expires_at: Instant::now() + ttl,
                },
            );
            return serde_json::from_str(&v).ok();
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
        self.local.insert(
            key.to_string(),
            CacheEntry {
                value: json.clone(),
                expires_at: Instant::now() + Duration::from_secs(ttl_secs),
            },
        );

        let mut conn = self.redis.clone();
        conn.set_ex::<_, _, ()>(key, json, ttl_secs).await?;
        Ok(())
    }

    pub fn invalidate_local(&self, key: &str) {
        self.local.remove(key);
    }

    /// Remove all locally-expired entries.  Call this periodically from a
    /// background task (e.g. every 60 s) to bound memory usage.
    pub fn evict_expired(&self) -> usize {
        let now = Instant::now();
        let before = self.local.len();
        self.local.retain(|_, entry| entry.expires_at > now);
        before - self.local.len()
    }

    /// Current number of entries in the local cache (for metrics / debugging).
    pub fn local_len(&self) -> usize {
        self.local.len()
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
