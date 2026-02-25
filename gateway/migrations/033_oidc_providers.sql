-- SSO / OIDC provider configuration.
-- Each org can configure one or more OIDC providers (Okta, Azure AD, etc.)
-- to authenticate users via JWT bearer tokens instead of API keys.

CREATE TABLE IF NOT EXISTS oidc_providers (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    -- Human-readable name (e.g. "Okta Production")
    name VARCHAR(255) NOT NULL,
    -- OIDC issuer URL (e.g. https://corp.okta.com)
    issuer_url VARCHAR(500) NOT NULL,
    -- OAuth2 client_id for this application
    client_id VARCHAR(255) NOT NULL,
    -- JWKS endpoint (auto-discovered or manually specified)
    jwks_uri VARCHAR(500),
    -- Optional: expected audience claim (defaults to client_id)
    audience VARCHAR(255),
    -- Claim mapping: maps OIDC claims to AILink RBAC attributes
    -- e.g. {"role": "custom:ailink_role", "scopes": "custom:ailink_scopes", "project_id": "custom:project"}
    claim_mapping JSONB NOT NULL DEFAULT '{}',
    -- Default role for users who don't have a role claim
    default_role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    -- Default scopes for authenticated users (comma-separated)
    default_scopes TEXT NOT NULL DEFAULT 'audit:read',
    -- Whether this provider is active
    enabled BOOLEAN NOT NULL DEFAULT true,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (org_id, issuer_url)
);

-- Fast lookup by org
CREATE INDEX idx_oidc_org ON oidc_providers(org_id) WHERE enabled = true;
