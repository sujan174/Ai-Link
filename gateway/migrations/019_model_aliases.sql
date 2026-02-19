-- Model aliases: project-level model name mapping
CREATE TABLE model_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    alias VARCHAR(128) NOT NULL,
    target_model VARCHAR(255) NOT NULL,
    target_provider VARCHAR(50) NOT NULL DEFAULT 'openai',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, alias)
);

CREATE INDEX idx_model_aliases_project ON model_aliases(project_id);
