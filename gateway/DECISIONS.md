# Deferred Decisions & Known Limitations

Items discovered during the adversarial security audit (Tier 1 — vault/tokens,
Tier 2 — policy engine) that were not fixed because they require an architectural
decision, a DB migration, or an explicit design choice.

---

## 1. System Prompt Transforms: Multi-Provider Support

**Area**: `2E-1` — `Action::Transform::{AppendSystemPrompt, PrependSystemPrompt}`

**Status**: ✅ **FIXED** (2025-Q1 — Issue 9)

`append_system_prompt` and `prepend_system_prompt` in `middleware/redact.rs` now handle:
- **OpenAI** format: `messages` array (existing behaviour preserved)
- **Anthropic** format: top-level `system` string field (new)

Gemini (`systemInstruction.parts[0].text`) is still not supported — falls through silently. Add Option D if needed.

**Where it was fixed**: `middleware/redact.rs` — `append_system_prompt`, `prepend_system_prompt`.

---

## 2. HITL: Concurrency Cap on Pending Approvals

**Area**: `2I-3` — `Action::RequireApproval`

**Status**: ✅ **FIXED** (2025-Q1 — Issue 8)

A configurable cap is now enforced before creating new approval requests:
- `HITL_MAX_PENDING_PER_TOKEN` environment variable (default `10`)
- Returns `403 Forbidden` when exceeded, with a descriptive error message
- Fail-open on DB errors (legitimate cap check failure does not block requests)

**Where it was fixed**: `proxy/handler.rs` (cap check before `create_approval_request`), `store/postgres.rs` (`count_pending_approvals_for_token`).

---

## 3. Master Key Versioning / Rotation (LOW — Architectural)

**Area**: Tier 1, vault audit.

**Status**: ⬜ Open — awaiting architectural decision

**Problem**: `vault/builtin.rs` uses a single master key from `TRUEFLOW_MASTER_KEY`.
There is no key version stored alongside encrypted credentials.
Rotating the master key makes all existing credentials unreadable.

**Decision needed**: Choose a rotation strategy:

| Option | Trade-off |
|--------|-----------|
| A. Store `key_version` column in `credentials` table; maintain a map of version → key | Backward-compatible, safe rotation, requires DB migration |
| B. Re-encrypt all credentials at rotation time (migration tool) | No schema change, operationally heavier |
| C. Use an external KMS (AWS KMS, GCP CKMS, HashiCorp Vault) | Offloads rotation entirely, adds dependency |

**Schema change (Option A)**:
```sql
ALTER TABLE credentials
    ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;
```

**Migration tool** (applicable to all options): a CLI binary that:
1. Reads all credentials (encrypted with old key version N).
2. Decrypts with key N.
3. Re-encrypts with key N+1.
4. Updates the row + key_version atomically.

---

## 4. TOCTOU on Token Validation (INFO — By Design)

**Area**: Tier 1, token audit.

**Status**: ✅ By design

**Behaviour**: A token is validated once at request entry. If the token is
revoked while a request is in-flight (e.g. during a long HITL wait), the
request continues with the original validated token.

**Decision**: This is the standard gateway design trade-off.
Re-validating mid-flight adds a DB round-trip on every HITL poll cycle.
The risk window is bounded by the HITL timeout (max 30 min).

**If you need stricter revocation** (e.g. for compliance): add a Redis-based
revocation tombstone for tokens and check it at every HITL poll iteration.

---

## 5. PCI Preset: Renamed to `pci_pan_only`

**Area**: `3C-2` — `guardrail_presets.rs` `"pci"` preset.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 1)

The preset has been renamed from `pci` → `pci_pan_only` and a warning added to its
description clarifying it only redacts the Primary Account Number (PAN). PCI-DSS v4.0
§3.3 also requires protection of expiry date, CVV/CVC, cardholder name, and service
code — none of which are reliably detectable by regex without semantic context.

Operators must pair this preset with field-based config or an external vault for
full PCI-DSS compliance.

**Where it was fixed**: `api/guardrail_presets.rs`.

---

## 6. HIPAA Preset: Partial Safe Harbor Coverage

**Area**: `3C-1` — `guardrail_presets.rs` `"hipaa"` preset.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 2)

A `WARNING` field has been added to the `hipaa` preset's API response documenting
its partial coverage. It currently covers 7 of the 18 HIPAA Safe Harbor identifiers
(SSN, email, phone, DOB, MRN, IP, IBAN). Missing identifiers (geographic sub-state
data, admission/discharge dates, device/URL/biometric identifiers) require
field-based config.

**Where it was fixed**: `api/guardrail_presets.rs`.

---

## 7. Custom Guardrail Patterns: Regex Now Cached

**Area**: `3A-3` — `middleware/guardrail.rs::check_content`.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 5)

Custom regex patterns are now cached in a thread-local `GUARDRAIL_REGEX_CACHE`
(256-entry, clear-all eviction, 1 MB `size_limit` per pattern for ReDoS protection).
This follows the same pattern as `engine.rs`. At 1000 req/s × 20 patterns, the
compile overhead drops from ~100% to <1% of one CPU core for warm-cache traffic.

**Where it was fixed**: `middleware/guardrail.rs` — `check_content` custom_patterns loop.

---

## 8. Distributed Circuit Breaker State

**Area**: `4A-2` — `proxy/loadbalancer.rs` `LoadBalancer`.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 3)

Circuit breaker failure counts are now shared across gateway instances via Redis:
- `LoadBalancer::new_with_redis(conn)` constructor wired in `main.rs`
- `mark_failed` fires an async `INCR` with TTL on a deterministic Redis key (`cb:<token_id>:<url_hash>`)
- `mark_healthy` fires async `DEL` on recovery
- `get_distributed_failure_count` reads the shared count, falling back to local state if Redis is unavailable

In-memory state is retained as an L1 cache (fast path). Redis is the source of truth
for cross-instance coordination. The Redis key TTL is `recovery_cooldown_secs × 3`.

**Where it was fixed**: `proxy/loadbalancer.rs`, `src/main.rs`.

---

## 9. Retry Time Budget

**Area**: `4B-3` — `proxy/retry.rs` `robust_request`.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 6)

`RetryConfig` now has `max_total_timeout_ms: Option<u64>` (`#[serde(default)]`, `None` = no
deadline, preserving existing behaviour). When set, `robust_request` enforces it at three
checkpoints:
1. Before each retry attempt (>1) — returns error if deadline already elapsed
2. Before sleeping after an HTTP error response — returns the last response if sleep would exceed deadline
3. Before sleeping after a network error — returns error if sleep would exceed deadline

**Where it was fixed**: `models/policy.rs` (field), `proxy/retry.rs` (enforcement).

---

## 10. Cache Bypass Scope-Gated

**Area**: `4C-2` — `proxy/response_cache.rs` `should_skip_cache`.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 4)

`x-trueflow-no-cache: true` is now only honoured when the requesting token has the
`cache:bypass` scope. Tokens without this scope have the header silently ignored.
The scope is parsed from `token.scopes` (a `serde_json::Value` JSON array) at the
call site in `proxy/handler.rs`.

**Where it was fixed**: `proxy/response_cache.rs`, `proxy/handler.rs`.

---

## 11. Rate-Based Circuit Breaker Threshold

**Area**: `4A-3` — `proxy/loadbalancer.rs`.

**Status**: ✅ **FIXED** (2025-Q1 — Issue 7)

`CircuitBreakerConfig` now has two optional fields:
- `failure_rate_threshold: Option<f64>` (0.0–1.0) — triggers rate-based circuit opening
- `min_sample_size: Option<u32>` — minimum requests before rate tripping is active (default 10)

When `failure_rate_threshold` is set it takes precedence over the count-based
`failure_threshold`. Outcomes are tracked in a per-upstream `VecDeque<bool>` rolling
window (bounded to `max(min_sample_size, 10)`). A `record_success` method is provided
for callers that want to populate success outcomes. The window is cleared on
`mark_healthy`.

**Where it was fixed**: `proxy/loadbalancer.rs`.

---

## 12. Half-Open TOCTOU Race (LOW — Accepted)

**Area**: `4A-4` — `proxy/loadbalancer.rs` `is_healthy_at` + `increment_half_open`.

**Status**: ✅ Accepted — no fix planned

**Problem**: Check and increment are non-atomic. Two concurrent requests can both pass the `half_open_attempts < max` check. Impact: one extra probe request during half-open (minor).

**Decision**: Accepted. The window is small and the consequence (1 extra probe) is negligible. Fix would require `AtomicU32` for `half_open_attempts` or a mutex, adding complexity for minimal benefit.

---

## Audit Reference

| ID | Severity | Class | Status | File |
|----|----------|-------|--------|------|
| 2E-1 | LOW | CLASS B | ✅ Fixed — Issue 9 | `middleware/redact.rs` |
| 2I-3 | LOW | CLASS C | ✅ Fixed — Issue 8 | `proxy/handler.rs`, `store/postgres.rs` |
| T1-KEY | LOW | — | ⬜ Open (architectural) | `vault/builtin.rs`, `store/postgres.rs` |
| T1-TOCTOU | INFO | — | ✅ By design | `proxy/handler.rs` |
| 3C-2 | HIGH | CLASS C | ✅ Fixed — Issue 1 | `api/guardrail_presets.rs` |
| 3C-1 | MEDIUM | CLASS C | ✅ Fixed — Issue 2 | `api/guardrail_presets.rs` |
| 3A-3 | MEDIUM | PERF | ✅ Fixed — Issue 5 | `middleware/guardrail.rs` |
| 4A-1 | CRITICAL | CORRECTNESS | ✅ Fixed | `proxy/handler.rs` |
| 4C-1 | HIGH | SILENT CORRUPT | ✅ Fixed | `proxy/response_cache.rs` |
| 4B-2 | HIGH | CORRECTNESS | ✅ Fixed | `proxy/retry.rs` |
| 4A-2 | HIGH | CORRECTNESS | ✅ Fixed — Issue 3 | `proxy/loadbalancer.rs` |
| 4D-1 | MEDIUM | SILENT CORRUPT | ✅ Fixed | `proxy/model_router.rs` |
| 4B-1 | MEDIUM | CORRECTNESS | ✅ Fixed | `proxy/retry.rs` |
| 4B-3 | MEDIUM | RESOURCE LEAK | ✅ Fixed — Issue 6 | `proxy/retry.rs` |
| 4C-2 | MEDIUM | CORRECTNESS | ✅ Fixed — Issue 4 | `proxy/response_cache.rs` |
| 4A-3 | MEDIUM | CORRECTNESS | ✅ Fixed — Issue 7 | `proxy/loadbalancer.rs` |
| 4F-1 | LOW | CORRECTNESS | ✅ Fixed | `proxy/smart_router.rs` |
| 4A-4 | LOW | CORRECTNESS | ✅ Accepted | `proxy/loadbalancer.rs` |
| 5A-1 | CRITICAL | BILLING BYPASS | ✅ Fixed | `proxy/stream_bridge.rs` |
| 5A-2 | HIGH | UNDER-COUNT | ✅ Fixed | `models/cost.rs` |
| 5D-3 | HIGH | TOCTOU | ✅ Fixed | `middleware/teams.rs` |
| 5B-1 | HIGH | BILLING | ✅ By design | `proxy/handler.rs` |
| 5B-2 | MEDIUM | UNDER-COUNT | ✅ Accepted | `proxy/handler.rs` |
| 5C-1 | MEDIUM | DESIGN | ✅ By design | `proxy/handler.rs` |
| 5D-4 | MEDIUM | PERF | ✅ Fixed | `middleware/spend.rs` |
| 5E-1 | LOW | CORRECTNESS | ✅ Fixed | `middleware/anomaly.rs` |
| 5D-1 | CLEAN | — | ✅ Verified | `middleware/spend.rs` |
| 5C-2 | CLEAN | — | ✅ Verified | `proxy/handler.rs` |

**Only 1 item remains open**: T1-KEY (master key rotation — requires architectural decision + DB migration).

Full audit reports:
- [`security_audit_tier1.md`](.gemini/antigravity/brain/a4bdf6d7-6475-4b2b-8322-60c09ce91123/security_audit_tier1.md)
- [`security_audit_tier2.md`](.gemini/antigravity/brain/a4bdf6d7-6475-4b2b-8322-60c09ce91123/security_audit_tier2.md)
- [`security_audit_tier3.md`](.gemini/antigravity/brain/a4bdf6d7-6475-4b2b-8322-60c09ce91123/security_audit_tier3.md)
- [`security_audit_tier4_5.md`](.gemini/antigravity/brain/a4bdf6d7-6475-4b2b-8322-60c09ce91123/security_audit_tier4_5.md)
- [`security_audit_tier6.md`](.gemini/antigravity/brain/a4bdf6d7-6475-4b2b-8322-60c09ce91123/security_audit_tier6.md)
