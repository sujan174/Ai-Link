-- HITL approval requests
CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(64) REFERENCES tokens(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    idempotency_key VARCHAR(255),
    request_summary JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(token_id, idempotency_key)
);

CREATE INDEX idx_approvals_status ON approval_requests(status) WHERE status = 'pending';

-- Credential rotation history
CREATE TABLE rotation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id UUID NOT NULL REFERENCES credentials(id),
    old_version INTEGER NOT NULL,
    new_version INTEGER NOT NULL,
    provider VARCHAR(50),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('success', 'failed', 'rollback')),
    error_message TEXT,
    rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
