# AIlink Release Notes

## v0.8.0 — Circuit Breaker DX

### New

- **Per-token Circuit Breaker Configuration** — each virtual token now carries a `circuit_breaker` JSONB config with a master `enabled` toggle and configurable `failure_threshold`, `recovery_cooldown_secs`, and `half_open_max_requests` fields. Defaults to `{enabled: true, threshold: 3, cooldown: 30s}`.
- **`GET /api/v1/tokens/:id/circuit-breaker`** — read current CB config for any token.
- **`PATCH /api/v1/tokens/:id/circuit-breaker`** — update CB config at runtime without a gateway restart.
- **`GET /api/v1/health/upstreams`** — view health status, failure count, and cooldown remaining for all tracked upstreams across all tokens.
- **`X-AILink-CB-State` response header** — every proxied request now returns `closed`, `open`, `half_open`, or `disabled`.
- **`X-AILink-Upstream` response header** — indicates which upstream URL served the request.
- **SDK: `tokens.upstream_health()`** — fetch upstream health status (sync + async).
- **SDK: `tokens.get_circuit_breaker(token_id)`** — read CB config via Python SDK.
- **SDK: `tokens.set_circuit_breaker(token_id, enabled=..., failure_threshold=...)`** — tune CB per-token at runtime.
- **SDK: `tokens.create(circuit_breaker={...})`** — set CB config at token creation time.
- **Database migration** `027_circuit_breaker.sql` — `circuit_breaker JSONB` column on `tokens`.

### Tests

- **21 Rust loadbalancer tests** (7 new): `get_circuit_state` transitions, custom thresholds, `mark_failed` no-op when disabled, `get_all_status` accuracy, config roundtrip, empty-JSON defaults.
- **64 Python SDK unit tests** (7 new): `upstream_health`, `get/set_circuit_breaker`, `create` with CB param, omit-field behavior.

---

## v0.7.0 — Dashboard UX Overhaul

### New

- **Settings Page Redesign** — Clean 2-column layout with vertical navigation and clear distinction between General, Security, and Advanced settings.
- **Theme Toggle** — Light/Dark/System mode support via `next-themes`.
- **Collapsible Sidebar** — Smooth animations using `framer-motion` to maximize screen real estate; icon-only mode when collapsed.
- **Improved Header Layout** — Project switcher moved to the header for better accessibility.

### Fixed

- **Sidebar Scrollbar** — Removed unsightly scrollbar from the navigation sidebar.
- **Next.js Lock** — Resolved development server lock issues during rapid restarts.

---

## v0.6.0 — Resilience Layer

### New

- **Retry engine** with exponential backoff, jitter, and `Retry-After` header support (`proxy/retry.rs`)
- **`RetryConfig`** model on policies — set `max_retries`, `base_delay_ms`, `max_backoff_ms` per policy
- **`Action::Allow`** — explicit pass-through action for policy rules
- **Dynamic safety timeout** — upstream timeout now scales with retry config instead of a fixed 65s cap
- **Retry integration tests** — `TestRetryLogic::test_retry_timing` validates backoff behavior end-to-end
- **SDK support** — Python SDK `policies.create()` and `policies.update()` accept `retry` config

### Fixed

- Internal error details (DB/Redis/anyhow) no longer leak to API clients — generic `"internal server error"` returned instead
- HITL timeout now properly uses the policy-configured value instead of ignoring it
- Removed redundant loop that re-scanned policies for the timeout string
- Cleaned up dead `apply_header_mutations` function (suppressed warning, kept for tests)
- Removed duplicate token creation in retry test fixture

### Security

- Masked admin keys in log output
- Dashboard admin key no longer exposed in client-side bundle (BFF proxy)
- Test-only headers gated behind `AILINK_ENABLE_TEST_HOOKS=1`
- Default master key triggers a startup warning

### Cleanup

- Removed dead modules: `shadow.rs`, `key_inject.rs`, `rate_limit.rs`, `idempotency.rs`, `aws_kms.rs`, `hashicorp.rs`
- Deleted `debug_gateway.py`
- Removed `ailink.egg-info/` from version control
- Fixed duplicate comments, updated all docs, removed stale YAML references

---

## v0.1.0 — Policy Engine

### New

- **JSON policy engine** — declarative `when`/`then` rules with conditions (`eq`, `neq`, `gt`, `lt`, `in`, `glob`, `regex`, `contains`) and logical operators (`all`, `any`, `not`)
- **Pre/post-flight evaluation** — policies run before or after the upstream call
- **Actions**: `allow`, `deny`, `rate_limit`, `require_approval`, `redact`, `transform`, `override`, `throttle`, `log`, `tag`, `webhook`
- **Shadow mode** — log policy matches without blocking requests
- **Spend tracking** — Redis-backed counters for request volume and cost
- **PII redaction** — built-in patterns for SSN, email, credit card, API keys, phone numbers
- **Analytics endpoints** — request volume, status distribution, latency percentiles
- **Projects API** — manage logical groupings for tokens and policies

### Fixed

- `AttributeError: 'AIlinkClient' object has no attribute 'projects'` in Python SDK
- HITL idempotency key matching
- Clippy warnings and dead code across the gateway

### Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Docker Compose setup including Dashboard and Jaeger.
