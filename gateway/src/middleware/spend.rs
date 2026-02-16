use crate::cache::TieredCache;
use crate::models::policy::Policy;
use anyhow::{Context, Result};
use chrono::Utc;
use redis::AsyncCommands;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use tracing::error;

/// Check if the token has exceeded its spend cap.
///
/// Note: In the new policy engine, spend caps can also be expressed as
/// conditional rules using `usage.spend_today_usd` fields. This legacy
/// function checks policies for SpendCap-compatible rules stored as
/// `Action::Deny` with usage conditions. For now, it checks Redis counters
/// directly using the token_id key pattern.
#[tracing::instrument(skip(cache, _policies))]
pub async fn check_spend_cap(
    cache: &TieredCache,
    token_id: &str,
    _policies: &[Policy],
) -> Result<()> {
    // The new policy engine handles spend cap checks via condition evaluation.
    // This function still checks the legacy Redis counters for backward compat.
    let mut conn = cache.redis();

    // Check daily spend cap
    let period_key = get_period_key("daily");
    let redis_key = format!("spend:{}:daily:{}", token_id, period_key);
    let _current_usage: f64 = conn.get(&redis_key).await.unwrap_or(0.0);

    // Enforcement is now done via policy engine conditions on usage.* fields
    // Legacy hard-coded caps removed — define them as policies instead.

    Ok(())
}

/// Track spend for a token.
/// Increments the Redis counter for daily and monthly windows.
pub async fn track_spend(
    cache: &TieredCache,
    db: &sqlx::PgPool,
    token_id: &str,
    _project_id: uuid::Uuid,
    cost: Decimal,
    _policies: &[Policy],
) -> Result<()> {
    if cost <= Decimal::ZERO {
        return Ok(());
    }

    let cost_f64 = cost.to_f64().unwrap_or(0.0);
    let mut conn = cache.redis();

    // Always track daily and monthly spend in Redis
    let mut pipe = redis::pipe();

    for window in &["daily", "monthly"] {
        let period_key = get_period_key(window);
        let redis_key = format!("spend:{}:{}:{}", token_id, window, period_key);

        let ttl: i64 = match *window {
            "daily" => 86400 + 3600,    // +1h buffer
            "monthly" => 86400 * 32,
            _ => 86400,
        };

        pipe.incr(&redis_key, cost_f64).expire(&redis_key, ttl);
    }

    let _: () = pipe
        .query_async(&mut conn)
        .await
        .context("Redis pipeline failed")?;

    // DB Persistence (async spawn)
    let tid = token_id.to_string();
    let pool = db.clone();

    tokio::spawn(async move {
        if let Err(e) = update_db_spend(&pool, &tid, "daily", cost).await {
            error!("Failed to persist spend to DB: {}", e);
        }
    });

    Ok(())
}

fn get_period_key(window: &str) -> String {
    let now = Utc::now();
    match window {
        "daily" => now.format("%Y-%m-%d").to_string(),
        "monthly" => now.format("%Y-%m").to_string(),
        _ => "default".to_string(),
    }
}

async fn update_db_spend(
    pool: &sqlx::PgPool,
    token_id: &str,
    period: &str,
    cost: Decimal,
) -> Result<()> {
    let _rows_affected = sqlx::query(
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
    .await?
    .rows_affected();

    Ok(())
}
