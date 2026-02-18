-- Notifications system for dashboard alerts
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,    -- 'approval_received', 'policy_violation', 'credential_expiry'
    title      TEXT NOT NULL,
    body       TEXT,
    metadata   JSONB,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_project ON notifications(project_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(project_id, is_read) WHERE NOT is_read;
