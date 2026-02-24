-- Migration 028: Add lifetime period to spend_caps
-- Enables absolute one-time budget limits (e.g. hackathon keys, trial accounts)

ALTER TABLE spend_caps
    DROP CONSTRAINT IF EXISTS spend_caps_period_check;

ALTER TABLE spend_caps
    ADD CONSTRAINT spend_caps_period_check
    CHECK (period IN ('daily', 'monthly', 'lifetime'));
