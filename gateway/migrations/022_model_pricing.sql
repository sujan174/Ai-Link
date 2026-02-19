-- Dynamic model pricing table.
-- Replaces the hardcoded match table in cost.rs.
-- Prices are in USD per 1,000,000 tokens (per-million).

CREATE TABLE model_pricing (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(50)  NOT NULL,  -- e.g. "openai", "anthropic", "google"
    model_pattern   VARCHAR(200) NOT NULL,  -- substring match, e.g. "gpt-4o", "claude-3-5-sonnet"
    input_per_m     NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- USD per 1M input tokens
    output_per_m    NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- USD per 1M output tokens
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, model_pattern)
);

CREATE INDEX idx_model_pricing_provider ON model_pricing (provider, is_active);

-- Seed with the same values previously hardcoded in cost.rs
-- OpenAI
INSERT INTO model_pricing (provider, model_pattern, input_per_m, output_per_m) VALUES
    ('openai', 'gpt-4o',        5.00,  15.00),
    ('openai', 'gpt-4-turbo',  10.00,  30.00),
    ('openai', 'gpt-4',        30.00,  60.00),
    ('openai', 'gpt-3.5-turbo', 0.50,   1.50),
    ('openai', 'o1',           15.00,  60.00),
    ('openai', 'o3-mini',       1.10,   4.40);

-- Anthropic
INSERT INTO model_pricing (provider, model_pattern, input_per_m, output_per_m) VALUES
    ('anthropic', 'claude-3-5-sonnet',  3.00,  15.00),
    ('anthropic', 'claude-3-5-haiku',   0.80,   4.00),
    ('anthropic', 'claude-3-opus',     15.00,  75.00),
    ('anthropic', 'claude-3-haiku',     0.25,   1.25),
    ('anthropic', 'claude-3-sonnet',    3.00,  15.00);

-- Google
INSERT INTO model_pricing (provider, model_pattern, input_per_m, output_per_m) VALUES
    ('google', 'gemini-1.5-pro',    3.50,  10.50),
    ('google', 'gemini-1.5-flash',  0.075,  0.30),
    ('google', 'gemini-2.0-flash',  0.10,   0.40);
