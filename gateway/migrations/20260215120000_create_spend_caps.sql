-- Track cumulative usage and limits for tokens
CREATE TABLE spend_caps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL, -- Denormalized for query speed
    token_id VARCHAR(64) NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    period VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'monthly')),
    limit_usd NUMERIC(14, 6) NOT NULL, -- High precision for fractional cents
    usage_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(token_id, period)
);

-- Index for finding caps that need reset
CREATE INDEX idx_spend_caps_reset ON spend_caps(reset_at);

-- Index for quick lookup during request processing
CREATE INDEX idx_spend_caps_token ON spend_caps(token_id);
