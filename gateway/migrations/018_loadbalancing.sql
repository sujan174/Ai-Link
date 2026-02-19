-- Loadbalancing: add upstreams JSON array to tokens (optional, falls back to upstream_url if null)
ALTER TABLE tokens ADD COLUMN upstreams JSONB;

-- Add cache_hit column to audit_logs was done in 017
-- Combine into single migration for loadbalancing features

COMMENT ON COLUMN tokens.upstreams IS 'JSON array of upstream targets: [{"url":"...","credential_id":"...","weight":70,"priority":1}]';
