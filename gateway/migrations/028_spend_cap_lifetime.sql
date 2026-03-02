-- Migration 028: Create spend_caps table (if missing) and add lifetime period
-- The CREATE TABLE was in a timestamp-named migration that was accidentally deleted.
-- CREATE TABLE IF NOT EXISTS is idempotent — no-op on existing databases.

CREATE TABLE IF NOT EXISTS spend_caps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    token_id VARCHAR(64) NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    period VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'monthly')),
    limit_usd NUMERIC(14, 6) NOT NULL,
    usage_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(token_id, period)
);

CREATE INDEX IF NOT EXISTS idx_spend_caps_reset ON spend_caps(reset_at);
CREATE INDEX IF NOT EXISTS idx_spend_caps_token ON spend_caps(token_id);

ALTER TABLE spend_caps
    DROP CONSTRAINT IF EXISTS spend_caps_period_check;

ALTER TABLE spend_caps
    ADD CONSTRAINT spend_caps_period_check
    CHECK (period IN ('daily', 'monthly', 'lifetime'));
