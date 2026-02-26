-- Team & Org Management (multi-team hierarchy, tag-based attribution)
-- Roadmap item #9

-- Teams sit between organizations/projects and tokens/api_keys
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- Per-team budget limits (NULL = no limit)
    max_budget_usd NUMERIC(12,4) DEFAULT NULL,
    budget_duration VARCHAR(20) DEFAULT NULL CHECK (budget_duration IN ('daily', 'weekly', 'monthly', 'yearly')),
    -- Per-team model access restrictions (same format as token allowed_models)
    -- NULL = inherit from org/project level (no restriction)
    allowed_models JSONB DEFAULT NULL,
    -- Tags for attribution and cost tracking
    tags JSONB NOT NULL DEFAULT '{}',
    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, name)
);

CREATE INDEX idx_teams_org ON teams(org_id);

-- Team membership (many-to-many between users and teams)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

-- Link tokens to teams for attribution
ALTER TABLE tokens
    ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN tags JSONB NOT NULL DEFAULT '{}';

CREATE INDEX idx_tokens_team ON tokens(team_id);

-- Link API keys to teams
ALTER TABLE api_keys
    ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL DEFAULT NULL;

-- Per-team spend tracking
CREATE TABLE team_spend (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    period DATE NOT NULL,
    total_requests BIGINT NOT NULL DEFAULT 0,
    total_tokens_used BIGINT NOT NULL DEFAULT 0,
    total_spend_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(team_id, period)
);

CREATE INDEX idx_team_spend_team_period ON team_spend(team_id, period);

-- Add team_id to audit_logs for attribution
ALTER TABLE audit_logs
    ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN tags JSONB DEFAULT NULL;

CREATE INDEX idx_audit_logs_team ON audit_logs(team_id);
