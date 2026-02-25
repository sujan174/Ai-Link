-- PII Tokenization Vault: reversible PII handling for enterprise compliance.
-- Replaces destructive [REDACTED_CC] with vault-backed tokens (tok_pii_cc_...)
-- that authorized callers can re-hydrate via the /api/v1/pii/rehydrate endpoint.

CREATE TABLE IF NOT EXISTS pii_token_vault (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    -- Deterministic token: tok_pii_{type}_{sha256_prefix}
    token VARCHAR(80) NOT NULL UNIQUE,
    -- PII category: "credit_card", "ssn", "email", etc.
    pii_type VARCHAR(50) NOT NULL,
    -- AES-256-GCM encrypted original value
    encrypted_value BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    -- Tenant isolation
    project_id UUID NOT NULL,
    -- Links back to the request that first created this token
    audit_log_id UUID,
    -- Auto-cleanup: tokens older than TTL are reaped
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

-- Fast token lookup (the hot path for re-hydration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pii_token ON pii_token_vault(token);
-- Tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_pii_project ON pii_token_vault(project_id, created_at DESC);
-- TTL reaper: find expired tokens for cleanup
CREATE INDEX IF NOT EXISTS idx_pii_expires ON pii_token_vault(expires_at);
