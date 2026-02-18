-- API Keys (Multi-tenant management)
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    key_hash    VARCHAR(128) NOT NULL UNIQUE,  -- SHA-256 of the actual key
    key_prefix  VARCHAR(12)  NOT NULL,         -- first 8 chars for display
    role        VARCHAR(50)  NOT NULL DEFAULT 'admin',  -- admin | member | readonly
    scopes      JSONB        NOT NULL DEFAULT '[]',     -- fine-grained: ["tokens:read","policies:write"]
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,                   -- optional expiry
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys (key_hash) WHERE is_active = true;
CREATE INDEX idx_api_keys_org  ON api_keys (org_id);

-- Usage Meters (Org-level billing)
CREATE TABLE usage_meters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period          DATE NOT NULL,  -- billing period start (e.g. 2026-02-01)
    total_requests  BIGINT NOT NULL DEFAULT 0,
    total_tokens_used BIGINT NOT NULL DEFAULT 0,  -- LLM tokens if applicable
    total_spend_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, period)
);

CREATE INDEX idx_usage_meters_org_period ON usage_meters(org_id, period);
