-- Migration 039: Prompt Management
-- Adds prompt registry with versioning, labels, and render API support.
-- Prompts are named, reusable templates. Each edit creates an immutable version.
-- {{variable}} Mustache-style placeholders in messages are resolved by the Render API.

CREATE TABLE IF NOT EXISTS prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    description TEXT DEFAULT '',
    folder      TEXT DEFAULT '/',
    tags        JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    created_by  TEXT DEFAULT '',
    is_active   BOOLEAN DEFAULT TRUE,
    UNIQUE(project_id, slug)
);

CREATE TABLE IF NOT EXISTS prompt_versions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id      UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    version        INTEGER NOT NULL,
    -- Template content
    model          TEXT NOT NULL,
    messages       JSONB NOT NULL,
    temperature    REAL DEFAULT 1.0,
    max_tokens     INTEGER,
    top_p          REAL,
    tools          JSONB,
    -- Metadata
    commit_message TEXT DEFAULT '',
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    created_by     TEXT DEFAULT '',
    -- Release labels: ["production"], ["staging","canary"], etc.
    labels         JSONB DEFAULT '[]',
    UNIQUE(prompt_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pv_prompt ON prompt_versions(prompt_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_pv_labels ON prompt_versions USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_prompts_slug ON prompts(project_id, slug);
CREATE INDEX IF NOT EXISTS idx_prompts_folder ON prompts(project_id, folder);

COMMENT ON TABLE prompts IS 'Named, reusable prompt templates — the prompt registry.';
COMMENT ON TABLE prompt_versions IS 'Immutable prompt versions. Each edit creates a new version.';
COMMENT ON COLUMN prompt_versions.messages IS 'OpenAI-format messages array with {{variable}} Mustache placeholders.';
COMMENT ON COLUMN prompt_versions.labels IS 'Release labels: ["production"], ["staging"]. Used by Render API for deployment routing.';
COMMENT ON COLUMN prompts.slug IS 'URL-safe key for API retrieval: GET /prompts/by-slug/:slug/render';
COMMENT ON COLUMN prompts.folder IS 'Cosmetic grouping path (e.g. "/agents/support"). No folder CRUD — just a string.';
