-- Add model access control columns to tokens table
-- These columns enable per-token model restrictions (Roadmap #7 RBAC depth)

-- Direct model allowlist: JSON array of model name patterns (globs)
-- NULL = all models allowed (backwards compatible, no restriction)
ALTER TABLE tokens
    ADD COLUMN IF NOT EXISTS allowed_models JSONB DEFAULT NULL;

-- References to named model_access_groups for reusable restrictions
-- NULL = no group-based restrictions
ALTER TABLE tokens
    ADD COLUMN IF NOT EXISTS allowed_model_group_ids UUID[] DEFAULT NULL;

-- Add response_model tracking to audit_logs for latency cache
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS response_model VARCHAR(255) DEFAULT NULL;
