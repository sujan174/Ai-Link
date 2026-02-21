-- Migration 027: Per-token circuit breaker configuration
--
-- Adds a JSONB column to `tokens` so each token can independently
-- enable/disable the circuit breaker and tune its thresholds.
--
-- Schema:
--   {
--     "enabled": true,               -- master toggle (default: true)
--     "failure_threshold": 3,        -- failures before circuit opens
--     "recovery_cooldown_secs": 30,  -- seconds before half-open retry
--     "half_open_max_requests": 1    -- requests allowed in half-open state
--   }

ALTER TABLE tokens
  ADD COLUMN circuit_breaker JSONB DEFAULT '{"enabled": true}'::jsonb;

COMMENT ON COLUMN tokens.circuit_breaker IS
  'Circuit breaker config: {"enabled": true, "failure_threshold": 3, "recovery_cooldown_secs": 30, "half_open_max_requests": 1}';
