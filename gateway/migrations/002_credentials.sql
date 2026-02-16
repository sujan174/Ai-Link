-- Encrypted credentials stored by the vault
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL,

    -- Envelope encryption: encrypted DEK + nonce + ciphertext
    encrypted_dek BYTEA NOT NULL,
    dek_nonce BYTEA NOT NULL,
    encrypted_secret BYTEA NOT NULL,
    secret_nonce BYTEA NOT NULL,
    
    -- Rotation tracking
    rotation_enabled BOOLEAN NOT NULL DEFAULT false,
    rotation_interval VARCHAR(20),
    last_rotated_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(project_id, name)
);

CREATE INDEX idx_credentials_project ON credentials(project_id);
