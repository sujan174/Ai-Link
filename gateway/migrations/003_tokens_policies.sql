-- Policies (declarative rules attached to tokens)
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    mode VARCHAR(10) NOT NULL DEFAULT 'enforce'
        CHECK (mode IN ('enforce', 'shadow')),
    rules JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(project_id, name)
);

-- Virtual tokens issued to agents
CREATE TABLE tokens (
    id VARCHAR(64) PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    credential_id UUID NOT NULL REFERENCES credentials(id),
    upstream_url TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]',
    policy_ids UUID[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(project_id, name)
);

CREATE INDEX idx_tokens_project ON tokens(project_id);
CREATE INDEX idx_tokens_credential ON tokens(credential_id);
