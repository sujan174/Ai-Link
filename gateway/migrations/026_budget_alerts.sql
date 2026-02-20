-- Migration 026: Budget alerts for projects
-- Allows per-project spending budgets with threshold-based notifications

CREATE TABLE IF NOT EXISTS budget_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Soft threshold: fires a warning webhook/notification at this % of budget
    warn_threshold_usd DECIMAL(12, 6) NOT NULL,
    -- Hard cap: block further requests when cumulative spend exceeds this
    hard_cap_usd DECIMAL(12, 6),
    -- Reset window: 'daily' | 'weekly' | 'monthly' | 'never'
    reset_period TEXT NOT NULL DEFAULT 'monthly',
    -- Notification channels (JSON array of webhook URLs)
    notify_webhooks JSONB NOT NULL DEFAULT '[]',
    -- Whether the hard cap is currently enforced (set false to bypass temporarily)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Tracks whether warn alert has fired in current period (avoid spam)
    warn_fired_at TIMESTAMPTZ,
    -- Tracks whether hard cap alert has fired
    cap_fired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_project
    ON budget_alerts(project_id)
    WHERE is_active = TRUE;

-- Cumulative spend per project per period (updated by the cost tracking job)
CREATE TABLE IF NOT EXISTS project_spend (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_key TEXT NOT NULL DEFAULT 'monthly', -- matches budget_alerts.reset_period
    spend_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE budget_alerts IS 'Per-project spending budget thresholds and alert configuration.';
COMMENT ON TABLE project_spend IS 'Running spend total per project for current billing period.';
