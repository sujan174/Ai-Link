-- Service Registry: generic service definitions for the Action Gateway.
-- Each service represents an external API (Stripe, Slack, OpenAI, etc.)
-- that the gateway can proxy requests to with automatic credential injection.

CREATE TABLE IF NOT EXISTS services (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id),
    name        VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    base_url    VARCHAR(2048) NOT NULL,
    service_type VARCHAR(50) NOT NULL DEFAULT 'generic',  -- 'llm' or 'generic'
    credential_id UUID REFERENCES credentials(id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, name)
);

CREATE INDEX idx_services_project ON services(project_id);
CREATE INDEX idx_services_name ON services(project_id, name);
