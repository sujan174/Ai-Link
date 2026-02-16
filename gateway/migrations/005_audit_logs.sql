-- Audit logs (partitioned by month for retention management)
CREATE TABLE audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    project_id UUID NOT NULL,
    token_id VARCHAR(64),
    agent_name VARCHAR(255),
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    upstream_url TEXT,
    request_body_hash VARCHAR(64),
    policies_evaluated JSONB,
    policy_result VARCHAR(20),
    policy_mode VARCHAR(10),
    deny_reason TEXT,
    hitl_required BOOLEAN DEFAULT false,
    hitl_decision VARCHAR(20),
    hitl_latency_ms INTEGER,
    upstream_status SMALLINT,
    response_latency_ms INTEGER,
    fields_redacted TEXT[],
    estimated_cost_usd NUMERIC(10, 4),
    trace_id VARCHAR(32),
    span_id VARCHAR(16),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial partitions (3 months)
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX idx_audit_project_time ON audit_logs(project_id, created_at DESC);
CREATE INDEX idx_audit_token ON audit_logs(token_id, created_at DESC);
