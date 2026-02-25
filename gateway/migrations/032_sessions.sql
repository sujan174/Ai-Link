-- Session Lifecycle Management: promote session_id from a plain audit column
-- to a first-class entity with lifecycle, spend caps, and metadata.
--
-- Sessions are auto-created on first request (upsert) and can be
-- paused/resumed/completed via the management API.

CREATE TABLE IF NOT EXISTS sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    -- The agent-provided session identifier (from X-Session-Id header)
    session_id VARCHAR(255) NOT NULL,
    project_id UUID NOT NULL,
    -- Which API token started this session (nullable for passthrough mode)
    token_id UUID,
    -- Lifecycle: active → paused → active → completed | expired
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- Optional session-level budget
    spend_cap_usd NUMERIC(12,6),
    -- Running totals (updated after each request)
    total_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    total_requests BIGINT NOT NULL DEFAULT 0,
    -- Agent-provided custom metadata
    metadata JSONB,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (id),
    -- Within a project, session_id is unique
    UNIQUE (project_id, session_id)
);

-- Fast lookup by session_id (the hot path)
CREATE INDEX idx_sessions_lookup ON sessions(session_id, project_id);
-- List sessions by recency
CREATE INDEX idx_sessions_project ON sessions(project_id, updated_at DESC);
-- Find active sessions (for spend cap enforcement)
CREATE INDEX idx_sessions_active ON sessions(project_id, status) WHERE status = 'active';
