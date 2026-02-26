-- Model access groups: per-token model-level RBAC
-- Allows restricting which models a virtual key can access.

-- Named model access groups (reusable across tokens)
CREATE TABLE model_access_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- Array of model patterns (exact names or globs like "gpt-4*", "claude-*")
    models JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(project_id, name)
);

CREATE INDEX idx_model_access_groups_project ON model_access_groups(project_id);

-- Per-token model access control
-- allowed_models: direct list of model name patterns (e.g. ["gpt-4o", "gpt-4o-mini", "claude-*"])
-- allowed_model_group_ids: references to named model_access_groups
-- If both are NULL/empty, all models are allowed (backwards compatible).
ALTER TABLE tokens
    ADD COLUMN allowed_models JSONB DEFAULT NULL,
    ADD COLUMN allowed_model_group_ids UUID[] DEFAULT NULL;
