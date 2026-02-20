-- Migration 024: Add signing_secret to webhooks table
-- Enables HMAC-SHA256 webhook payload signing (X-AILink-Signature header)

ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS signing_secret TEXT;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 3;

-- Index to support filtering active webhooks by project
CREATE INDEX IF NOT EXISTS idx_webhooks_project_active
    ON webhooks(project_id, is_active);

COMMENT ON COLUMN webhooks.signing_secret IS
    'Random 32-byte hex secret used to sign webhook payloads with HMAC-SHA256. Shown once on creation.';
COMMENT ON COLUMN webhooks.retry_count IS
    'Maximum delivery retries (default 3 with exponential back-off 1s, 5s, 25s).';
