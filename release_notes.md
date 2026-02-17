# AIlink Release Notes

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
