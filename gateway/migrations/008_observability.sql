-- Phase 4: Privacy-First Observability
-- Adds AI golden signals, attribution headers, privacy-tier logging,
-- and a separate body-storage table to avoid TOAST bloat.

-- ── Main table: lightweight columns only ─────────────────────

-- AI Golden Signals
ALTER TABLE audit_logs ADD COLUMN prompt_tokens INTEGER;
ALTER TABLE audit_logs ADD COLUMN completion_tokens INTEGER;
ALTER TABLE audit_logs ADD COLUMN model VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN ttft_ms INTEGER;
ALTER TABLE audit_logs ADD COLUMN tokens_per_second REAL;

-- Attribution
ALTER TABLE audit_logs ADD COLUMN user_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN tenant_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN external_request_id VARCHAR(255);

-- Privacy level (0=metadata, 1=redacted, 2=full-debug)
ALTER TABLE audit_logs ADD COLUMN log_level SMALLINT DEFAULT 1;

-- Index for expiry job targeting Level 2 logs
CREATE INDEX idx_audit_log_level_expiry ON audit_logs (log_level, created_at)
    WHERE log_level = 2;

-- Index for attribution lookups
CREATE INDEX idx_audit_user_id ON audit_logs (user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- ── Separate body table (TOAST mitigation) ───────────────────

CREATE TABLE audit_log_bodies (
    audit_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_body TEXT,
    response_body TEXT,
    request_headers JSONB,
    response_headers JSONB,
    PRIMARY KEY (audit_id, created_at)
) PARTITION BY RANGE (created_at);

-- Match existing audit_logs partitions
CREATE TABLE audit_log_bodies_2026_02 PARTITION OF audit_log_bodies
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_log_bodies_2026_03 PARTITION OF audit_log_bodies
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_log_bodies_2026_04 PARTITION OF audit_log_bodies
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX idx_body_audit_id ON audit_log_bodies (audit_id);

-- ── Token-level log config ───────────────────────────────────

ALTER TABLE tokens ADD COLUMN log_level SMALLINT DEFAULT 1;
