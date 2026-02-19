-- Make credential_id optional on tokens to support passthrough mode.
-- In passthrough mode, agents provide their own API key via X-Real-Authorization header.
-- The gateway still provides observability (audit logs, analytics, cost tracking).
ALTER TABLE tokens ALTER COLUMN credential_id DROP NOT NULL;
