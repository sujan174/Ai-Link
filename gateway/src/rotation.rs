use uuid::Uuid;

/// Handles automatic rotation of upstream API keys.
/// Runs as a background task, checking credentials with rotation enabled.
pub struct RotationScheduler {
    // TODO: store handle, db pool, vault reference
}

impl RotationScheduler {
    pub fn new() -> Self {
        Self {}
    }

    /// Spawns a background task that checks for credentials due for rotation.
    pub async fn start(&self) -> anyhow::Result<()> {
        // TODO:
        // 1. Query credentials where rotation_enabled = true AND last_rotated + interval < now
        // 2. For each, call provider-specific rotation API
        // 3. Encrypt new key, update PG, invalidate cache
        tracing::info!("Key rotation scheduler started");
        Ok(())
    }
}
