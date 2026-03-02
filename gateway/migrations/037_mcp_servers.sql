-- MCP Server persistence + OAuth 2.0 credential storage
-- Replaces in-memory-only MCP registry with DB-backed state

CREATE TABLE IF NOT EXISTS mcp_servers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    endpoint                TEXT NOT NULL,

    -- Authentication type: 'none' | 'bearer' | 'oauth2'
    auth_type               TEXT NOT NULL DEFAULT 'none',
    api_key_encrypted       TEXT,                    -- AES-256-GCM encrypted Bearer token

    -- OAuth 2.0 fields (populated by auto-discovery or manually)
    oauth_client_id         TEXT,
    oauth_client_secret_enc TEXT,                    -- encrypted
    oauth_token_endpoint    TEXT,
    oauth_scopes            TEXT[],
    oauth_access_token_enc  TEXT,                    -- encrypted, cached
    oauth_refresh_token_enc TEXT,                    -- encrypted
    oauth_token_expires_at  TIMESTAMPTZ,

    -- Runtime metadata
    status                  TEXT NOT NULL DEFAULT 'pending',
    tool_count              INTEGER NOT NULL DEFAULT 0,
    last_error              TEXT,
    discovered_server_info  JSONB,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS mcp_server_tools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id       UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    input_schema    JSONB NOT NULL,
    output_schema   JSONB,
    UNIQUE(server_id, name)
);

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_mcp_servers_project ON mcp_servers(project_id);
CREATE INDEX IF NOT EXISTS idx_mcp_server_tools_server ON mcp_server_tools(server_id);
