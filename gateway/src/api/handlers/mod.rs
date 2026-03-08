pub mod dtos;
mod helpers;
mod projects;
mod tokens;
mod approvals;
mod audit;
mod sessions;
mod policies;
mod credentials;
mod notifications;
mod services;
mod auth;
mod analytics;
mod spend_caps;
mod webhooks;
mod pricing;
mod settings;
mod model_access;
mod teams;

// ── Re-exports: DTOs ────────────────────────────────────────
pub use self::dtos::*;

// ── Re-exports: Helpers ─────────────────────────────────────
pub use self::helpers::verify_project_ownership;

// ── Re-exports: Projects ────────────────────────────────────
pub use self::projects::{
    list_projects, create_project, update_project, delete_project, purge_project_data,
};

// ── Re-exports: Tokens ──────────────────────────────────────
pub use self::tokens::{
    list_tokens, create_token, revoke_token, get_token_usage,
    get_circuit_breaker, update_circuit_breaker,
};

// ── Re-exports: Approvals ───────────────────────────────────
pub use self::approvals::{list_approvals, decide_approval};

// ── Re-exports: Audit ───────────────────────────────────────
pub use self::audit::{list_audit_logs, get_audit_log, stream_audit_logs};

// ── Re-exports: Sessions ────────────────────────────────────
pub use self::sessions::{
    get_session, list_sessions, update_session_status,
    set_session_spend_cap, get_session_entity,
};

// ── Re-exports: Policies ────────────────────────────────────
pub use self::policies::{
    list_policies, create_policy, update_policy, delete_policy, list_policy_versions,
};

// ── Re-exports: Credentials ─────────────────────────────────
pub use self::credentials::{list_credentials, create_credential, delete_credential};

// ── Re-exports: Notifications ───────────────────────────────
pub use self::notifications::{
    list_notifications, count_unread_notifications,
    mark_notification_read, mark_all_notifications_read,
};

// ── Re-exports: Services ────────────────────────────────────
pub use self::services::{list_services, create_service, delete_service};

// ── Re-exports: Auth / API Keys ─────────────────────────────
pub use self::auth::{list_api_keys, create_api_key, revoke_api_key, whoami};

// ── Re-exports: Analytics ───────────────────────────────────
pub use self::analytics::{
    get_org_usage, get_token_analytics, get_token_volume,
    get_token_status, get_token_latency, get_upstream_health,
    get_analytics_summary, get_analytics_timeseries,
    get_analytics_experiments, get_spend_breakdown,
};

// ── Re-exports: Spend Caps ──────────────────────────────────
pub use self::spend_caps::{get_spend_caps, upsert_spend_cap, delete_spend_cap};

// ── Re-exports: Webhooks ────────────────────────────────────
pub use self::webhooks::{list_webhooks, create_webhook, delete_webhook, test_webhook};

// ── Re-exports: Pricing ─────────────────────────────────────
pub use self::pricing::{list_pricing, upsert_pricing, delete_pricing};

// ── Re-exports: Settings ────────────────────────────────────
pub use self::settings::{
    get_settings, update_settings, get_cache_stats, flush_cache,
    rehydrate_pii_tokens, get_anomaly_events,
};

// ── Re-exports: Model Access Groups ─────────────────────────
pub use self::model_access::{
    list_model_access_groups, create_model_access_group,
    update_model_access_group, delete_model_access_group,
};

// ── Re-exports: Teams ───────────────────────────────────────
pub use self::teams::{
    list_teams, create_team, update_team, delete_team,
    list_team_members, add_team_member, remove_team_member, get_team_spend,
};
