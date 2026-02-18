-- Policy version history: snapshot every edit as an immutable row
CREATE TABLE IF NOT EXISTS policy_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    name        VARCHAR(255),
    mode        VARCHAR(10),
    phase       VARCHAR(10),
    rules       JSONB NOT NULL,
    retry       JSONB,
    changed_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_versions_lookup ON policy_versions(policy_id, version DESC);
