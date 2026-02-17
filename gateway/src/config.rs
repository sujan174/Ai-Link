use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub master_key: String,
    pub admin_key: Option<String>,
    pub slack_webhook_url: Option<String>,
}

impl Config {
    /// Returns the admin key for API authentication.
    /// Falls back to master_key if AILINK_ADMIN_KEY is not set.
    pub fn admin_key(&self) -> &str {
        self.admin_key.as_deref().unwrap_or(&self.master_key)
    }
}

pub fn load() -> anyhow::Result<Config> {
    dotenvy::dotenv().ok();

    let master_key = std::env::var("AILINK_MASTER_KEY")
        .unwrap_or_else(|_| "CHANGE_ME_32_BYTE_HEX_KEY".into());

    if master_key == "CHANGE_ME_32_BYTE_HEX_KEY" {
        eprintln!("⚠️  AILINK_MASTER_KEY is not set — using insecure placeholder. Set a 64-char hex key for production.");
    }

    Ok(Config {
        port: std::env::var("AILINK_PORT")
            .unwrap_or_else(|_| "8443".into())
            .parse()
            .unwrap_or(8443),
        database_url: std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://localhost/ailink".into()),
        redis_url: std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
        master_key,
        admin_key: std::env::var("AILINK_ADMIN_KEY").ok(),
        slack_webhook_url: std::env::var("AILINK_SLACK_WEBHOOK_URL").ok(),
    })
}
