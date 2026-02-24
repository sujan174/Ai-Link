-- Just Enough Observability: Custom Properties & Payload URL
-- custom_properties: arbitrary JSON key-values from X-Properties header (GIN-indexed for fast filtering)
-- payload_url: object-store reference when bodies are offloaded from Postgres (S3/MinIO/local)

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS custom_properties JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS payload_url TEXT;

-- GIN index enables fast JSONB queries like:
--   WHERE custom_properties @> '{"env":"prod", "customer":"acme"}'
CREATE INDEX IF NOT EXISTS idx_audit_custom_props
    ON audit_logs USING GIN (custom_properties)
    WHERE custom_properties IS NOT NULL;

-- Partial index for rows where body was offloaded to object store
CREATE INDEX IF NOT EXISTS idx_audit_payload_url
    ON audit_logs (id, created_at)
    WHERE payload_url IS NOT NULL;

-- Index for filtering by a specific property value
-- Used for queries like: "show all requests with env=prod"
CREATE INDEX IF NOT EXISTS idx_audit_session_props
    ON audit_logs (session_id, created_at DESC)
    WHERE session_id IS NOT NULL AND custom_properties IS NOT NULL;
