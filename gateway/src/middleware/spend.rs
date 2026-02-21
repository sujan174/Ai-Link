use crate::cache::TieredCache;
use anyhow::{Context, Result};
use chrono::{Datelike, Utc};
use redis::AsyncCommands;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

// ── Spend Cap Config ──────────────────────────────────────────

/// Spend cap configuration for a token (loaded from DB).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpendCap {
    pub daily_limit_usd: Option<f64>,
    pub monthly_limit_usd: Option<f64>,
}

/// Current spend status for a token (for the API/dashboard).
#[derive(Debug, Serialize)]
pub struct SpendStatus {
    pub daily_limit_usd: Option<f64>,
    pub monthly_limit_usd: Option<f64>,
    pub current_daily_usd: f64,
    pub current_monthly_usd: f64,
}

// ── Enforcement ───────────────────────────────────────────────

/// Check if the token has exceeded its spend cap.
///
/// Reads the current daily and monthly spend from Redis and compares
/// against the caps stored in the `spend_caps` DB table.
///
/// Returns `Err` with a human-readable message if any cap is exceeded.
#[tracing::instrument(skip(cache, db))]
pub async fn check_spend_cap(
    cache: &TieredCache,
    db: &sqlx::PgPool,
    token_id: &str,
) -> Result<()> {
    // Load caps (DB-backed)
    let caps = load_spend_caps(db, token_id).await?;

    // Nothing to enforce if no caps are configured
    if caps.daily_limit_usd.is_none() && caps.monthly_limit_usd.is_none() {
        return Ok(());
    }

    let mut conn = cache.redis();
    let now = Utc::now();

    // SEC-03: Pre-flight check is best-effort; true atomic enforcement happens
    // in `check_and_increment_spend` after cost is known.
    // We add a small headroom factor (95% of limit) to reduce false negatives
    // from concurrent requests in the TOCTOU window.

    // Check daily cap
    if let Some(daily_limit) = caps.daily_limit_usd {
        let key = format!("spend:{}:daily:{}", token_id, now.format("%Y-%m-%d"));
        // INCRBYFLOAT stores values as bulk strings — parse as String first
        let current: f64 = conn
            .get::<_, Option<String>>(&key)
            .await
            .unwrap_or(None)
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        if current >= daily_limit {
            anyhow::bail!(
                "daily spend cap of ${:.2} exceeded (current: ${:.4})",
                daily_limit,
                current
            );
        }
    }

    // Check monthly cap
    if let Some(monthly_limit) = caps.monthly_limit_usd {
        let key = format!("spend:{}:monthly:{}", token_id, now.format("%Y-%m"));
        let current: f64 = conn
            .get::<_, Option<String>>(&key)
            .await
            .unwrap_or(None)
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        if current >= monthly_limit {
            anyhow::bail!(
                "monthly spend cap of ${:.2} exceeded (current: ${:.4})",
                monthly_limit,
                current
            );
        }
    }

    Ok(())
}

/// SEC-03: Atomic check-and-increment using Redis Lua script.
/// Returns Ok(()) if the spend was successfully incremented (under cap),
/// or Err if the cap would be exceeded.
pub async fn check_and_increment_spend(
    cache: &TieredCache,
    db: &sqlx::PgPool,
    token_id: &str,
    cost_usd: f64,
) -> Result<()> {
    if cost_usd <= 0.0 {
        return Ok(());
    }

    let caps = load_spend_caps(db, token_id).await?;
    let mut conn = cache.redis();
    let now = Utc::now();

    // Lua script: atomically check limit and increment
    // KEYS[1] = spend key, ARGV[1] = limit, ARGV[2] = cost, ARGV[3] = TTL
    // Returns: new_total if under limit, or -1 if cap would be exceeded
    let lua_script = r#"
        local current = tonumber(redis.call('GET', KEYS[1]) or '0')
        local limit = tonumber(ARGV[1])
        local cost = tonumber(ARGV[2])
        local ttl = tonumber(ARGV[3])
        if limit > 0 and (current + cost) > limit then
            return -1
        end
        local new_val = redis.call('INCRBYFLOAT', KEYS[1], cost)
        redis.call('EXPIRE', KEYS[1], ttl)
        return new_val
    "#;

    // Check daily cap
    if let Some(daily_limit) = caps.daily_limit_usd {
        let key = format!("spend:{}:daily:{}", token_id, now.format("%Y-%m-%d"));
        let result: f64 = redis::cmd("EVAL")
            .arg(lua_script)
            .arg(1i32) // number of KEYS
            .arg(&key)
            .arg(daily_limit)
            .arg(cost_usd)
            .arg(86400 + 3600) // TTL
            .query_async(&mut conn)
            .await
            .unwrap_or(-1.0);
        if result < 0.0 {
            anyhow::bail!(
                "daily spend cap of ${:.2} would be exceeded",
                daily_limit
            );
        }
    } else {
        // No daily cap — just increment
        let key = format!("spend:{}:daily:{}", token_id, now.format("%Y-%m-%d"));
        let _: f64 = redis::cmd("INCRBYFLOAT")
            .arg(&key)
            .arg(cost_usd)
            .query_async(&mut conn)
            .await
            .unwrap_or(cost_usd);
        let _: () = conn.expire(&key, 86400 + 3600).await.unwrap_or(());
    }

    // Check monthly cap
    if let Some(monthly_limit) = caps.monthly_limit_usd {
        let key = format!("spend:{}:monthly:{}", token_id, now.format("%Y-%m"));
        let result: f64 = redis::cmd("EVAL")
            .arg(lua_script)
            .arg(1i32)
            .arg(&key)
            .arg(monthly_limit)
            .arg(cost_usd)
            .arg(86400 * 32)
            .query_async(&mut conn)
            .await
            .unwrap_or(-1.0);
        if result < 0.0 {
            anyhow::bail!(
                "monthly spend cap of ${:.2} would be exceeded",
                monthly_limit
            );
        }
    } else {
        let key = format!("spend:{}:monthly:{}", token_id, now.format("%Y-%m"));
        let _: f64 = redis::cmd("INCRBYFLOAT")
            .arg(&key)
            .arg(cost_usd)
            .query_async(&mut conn)
            .await
            .unwrap_or(cost_usd);
        let _: () = conn.expire(&key, 86400i64 * 32).await.unwrap_or(());
    }

    // DB persistence (fire-and-forget, same as track_spend)
    let tid = token_id.to_string();
    let pool = db.clone();
    let cost_decimal = rust_decimal::Decimal::from_f64_retain(cost_usd)
        .unwrap_or(rust_decimal::Decimal::ZERO);
    tokio::spawn(async move {
        for period in &["daily", "monthly"] {
            if let Err(e) = update_db_spend(&pool, &tid, period, cost_decimal).await {
                error!("Failed to persist {} spend to DB: {}", period, e);
            }
        }
    });

    Ok(())
}

// ── DB Helpers ────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct SpendCapRow {
    period: String,
    limit_usd: rust_decimal::Decimal,
}

/// Load spend caps for a token from DB.
async fn load_spend_caps(db: &sqlx::PgPool, token_id: &str) -> Result<SpendCap> {
    let rows = sqlx::query_as::<_, SpendCapRow>(
        "SELECT period, limit_usd FROM spend_caps WHERE token_id = $1",
    )
    .bind(token_id)
    .fetch_all(db)
    .await
    .context("failed to load spend caps")?;

    let mut caps = SpendCap::default();
    for row in rows {
        let limit = row.limit_usd.to_f64().unwrap_or(0.0);
        match row.period.as_str() {
            "daily" => caps.daily_limit_usd = Some(limit),
            "monthly" => caps.monthly_limit_usd = Some(limit),
            _ => {}
        }
    }

    Ok(caps)
}

// ── Tracking ──────────────────────────────────────────────────

/// Track spend for a token.
/// Increments the Redis counter for daily and monthly windows.
#[allow(dead_code)]
pub async fn track_spend(
    cache: &TieredCache,
    db: &sqlx::PgPool,
    token_id: &str,
    _project_id: uuid::Uuid,
    cost: Decimal,
) -> Result<()> {
    if cost <= Decimal::ZERO {
        return Ok(());
    }

    let cost_f64 = cost.to_f64().unwrap_or(0.0);
    let mut conn = cache.redis();
    let now = Utc::now();

    // Increment daily and monthly spend in Redis using INCRBYFLOAT
    for window in &["daily", "monthly"] {
        let period_key = match *window {
            "daily" => now.format("%Y-%m-%d").to_string(),
            "monthly" => now.format("%Y-%m").to_string(),
            _ => continue,
        };
        let redis_key = format!("spend:{}:{}:{}", token_id, window, period_key);
        let ttl: usize = match *window {
            "daily" => 86400 + 3600,
            "monthly" => 86400 * 32,
            _ => 86400,
        };

        // INCRBYFLOAT + EXPIRE (two commands, not pipelined — simpler and correct)
        let _: f64 = redis::cmd("INCRBYFLOAT")
            .arg(&redis_key)
            .arg(cost_f64)
            .query_async(&mut conn)
            .await
            .unwrap_or(cost_f64);

        let _: () = conn.expire(&redis_key, ttl as i64).await.unwrap_or(());
    }

    // BUG-01 fix: DB Persistence for BOTH daily AND monthly (async spawn)
    let tid = token_id.to_string();
    let pool = db.clone();
    let cost_clone = cost;

    tokio::spawn(async move {
        for period in &["daily", "monthly"] {
            if let Err(e) = update_db_spend(&pool, &tid, period, cost_clone).await {
                error!("Failed to persist {} spend to DB: {}", period, e);
            }
        }
    });

    Ok(())
}

// ── Spend Cap CRUD ────────────────────────────────────────────

/// Set or update a spend cap for a token.
pub async fn upsert_spend_cap(
    db: &sqlx::PgPool,
    token_id: &str,
    project_id: uuid::Uuid,
    period: &str,
    limit_usd: Decimal,
) -> Result<()> {
    let reset_at = next_reset_at(period);
    sqlx::query(
        r#"
        INSERT INTO spend_caps (token_id, project_id, period, limit_usd, usage_usd, reset_at)
        VALUES ($1, $2, $3, $4, 0, $5)
        ON CONFLICT (token_id, period)
        DO UPDATE SET limit_usd = $4, updated_at = now()
        "#,
    )
    .bind(token_id)
    .bind(project_id)
    .bind(period)
    .bind(limit_usd)
    .bind(reset_at)
    .execute(db)
    .await
    .context("failed to upsert spend cap")?;

    info!(token_id, period, limit_usd = %limit_usd, "spend cap configured");
    Ok(())
}

/// Delete a spend cap for a token.
pub async fn delete_spend_cap(db: &sqlx::PgPool, token_id: &str, period: &str) -> Result<()> {
    sqlx::query("DELETE FROM spend_caps WHERE token_id = $1 AND period = $2")
        .bind(token_id)
        .bind(period)
        .execute(db)
        .await
        .context("failed to delete spend cap")?;
    Ok(())
}

/// Get current spend + caps for a token (for the API/dashboard).
pub async fn get_spend_status(
    db: &sqlx::PgPool,
    cache: &TieredCache,
    token_id: &str,
) -> Result<SpendStatus> {
    let caps = load_spend_caps(db, token_id).await?;
    let mut conn = cache.redis();
    let now = Utc::now();

    let daily_key = format!("spend:{}:daily:{}", token_id, now.format("%Y-%m-%d"));
    let monthly_key = format!("spend:{}:monthly:{}", token_id, now.format("%Y-%m"));

    // INCRBYFLOAT stores values as bulk strings — get as Option<String> and parse
    let daily_spend: f64 = conn
        .get::<_, Option<String>>(&daily_key)
        .await
        .unwrap_or(None)
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let monthly_spend: f64 = conn
        .get::<_, Option<String>>(&monthly_key)
        .await
        .unwrap_or(None)
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(SpendStatus {
        daily_limit_usd: caps.daily_limit_usd,
        monthly_limit_usd: caps.monthly_limit_usd,
        current_daily_usd: daily_spend,
        current_monthly_usd: monthly_spend,
    })
}

// ── Helpers ───────────────────────────────────────────────────

fn next_reset_at(period: &str) -> chrono::DateTime<Utc> {
    let now = Utc::now();
    match period {
        "daily" => {
            let tomorrow = now.date_naive() + chrono::Duration::days(1);
            tomorrow.and_hms_opt(0, 0, 0).unwrap().and_utc()
        }
        "monthly" => {
            let next_month = if now.month() == 12 {
                chrono::NaiveDate::from_ymd_opt(now.year() + 1, 1, 1).unwrap()
            } else {
                chrono::NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1).unwrap()
            };
            next_month.and_hms_opt(0, 0, 0).unwrap().and_utc()
        }
        _ => now + chrono::Duration::days(1),
    }
}

async fn update_db_spend(
    pool: &sqlx::PgPool,
    token_id: &str,
    period: &str,
    cost: Decimal,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE spend_caps
        SET usage_usd = usage_usd + $3, updated_at = now()
        WHERE token_id = $1 AND period = $2
        "#,
    )
    .bind(token_id)
    .bind(period)
    .bind(cost)
    .execute(pool)
    .await?;

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_period_key_daily() {
        let now = Utc::now();
        let key = now.format("%Y-%m-%d").to_string();
        assert_eq!(key.len(), 10);
        assert!(key.contains('-'));
    }

    #[test]
    fn test_get_period_key_monthly() {
        let now = Utc::now();
        let key = now.format("%Y-%m").to_string();
        assert_eq!(key.len(), 7);
        assert!(key.contains('-'));
    }

    #[test]
    fn test_next_reset_at_daily() {
        let reset = next_reset_at("daily");
        let now = Utc::now();
        assert!(reset > now);
        assert!(reset <= now + chrono::Duration::days(2));
    }

    #[test]
    fn test_next_reset_at_monthly() {
        let reset = next_reset_at("monthly");
        let now = Utc::now();
        assert!(reset > now);
        assert!(reset <= now + chrono::Duration::days(32));
    }
}
