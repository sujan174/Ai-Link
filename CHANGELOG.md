# TrueFlow Changelog

## [Unreleased] — 2026-03-06

### Security

**SEC-FIX-1 — Approval Decision: Missing Ownership Check**  
`POST /api/v1/approvals/:id/decision`

Previously, any admin with `approvals:write` could approve or reject any approval
request by guessing its UUID, regardless of project ownership.

Fix: The handler now fetches the approval record before acting on it and verifies
that `approval.project_id == auth.default_project_id()`. On mismatch, it returns
`404 Not Found` (not `403`) to prevent cross-project ID enumeration.

Test added: `test_approval_decision_cross_project_returns_404`

---

**SEC-FIX-2 — Circuit Breaker: Missing Ownership Check**  
`GET  /api/v1/tokens/:id/circuit-breaker`  
`PATCH /api/v1/tokens/:id/circuit-breaker`

Previously, both endpoints would return or modify circuit-breaker config for any
token UUID regardless of project ownership, allowing cross-project data reads and
configuration tampering.

Fix: Both handlers now compare `token.project_id` against `auth.default_project_id()`
after fetching the token. On mismatch, they return `404 Not Found`.

Tests added:
- `test_get_cb_config_cross_project_returns_404`
- `test_patch_cb_config_cross_project_returns_404`

---

**SEC-FIX-3 — Policy Versions: Missing Ownership Check**  
`GET /api/v1/policies/:id/versions`

Previously, any caller with `policies:read` scope could enumerate version history
for any policy UUID, including policies from other projects.

Fix: The handler now calls `db.policy_belongs_to_project(id, project_id)` before
returning version history. If the policy does not belong to the caller's project
(whether it exists elsewhere or not), it returns `404 Not Found`.

New DB method: `Db::policy_belongs_to_project(policy_id, project_id) -> bool`

Test added: `test_policy_versions_cross_project_returns_404`

---

**SEC-FIX-4 — Teams and Model Access Groups: Missing Admin Role Check**  
Affected endpoints (8 total):  
- `POST   /api/v1/teams`
- `PUT    /api/v1/teams/:id`
- `DELETE /api/v1/teams/:id`
- `POST   /api/v1/teams/:id/members`
- `DELETE /api/v1/teams/:id/members/:user_id`
- `POST   /api/v1/model-access-groups`
- `PUT    /api/v1/model-access-groups/:id`
- `DELETE /api/v1/model-access-groups/:id`

Previously, these endpoints only required the `tokens:write` scope. A `Member`-role
API key with `tokens:write` could create, modify, or delete teams and model access
groups — which control budget allocation and which AI models tokens can access.

Fix: Added `auth.require_role("admin")?` as the first guard in each of the 8
handlers, before any DB call.

Tests added:
- `test_create_team_requires_admin_role`
- `test_create_model_access_group_requires_admin_role`

---

**SEC-FIX-5 — Anomaly Detection: Cross-Project Redis Data Leak**  
`GET /api/v1/anomalies`

Previously, the anomaly endpoint SCANned Redis for `anomaly:tok:*` keys which
spanned all projects in the Redis instance. Any admin could see velocity anomaly
data for tokens in other projects.

Fix: Changed the Redis key format from `anomaly:tok:{token_id}` to
`anomaly:tok:{project_id}:{token_id}`. The SCAN in the API handler now uses the
project-scoped pattern `anomaly:tok:{project_id}:*`, inherently isolating results
to the caller's project without extra DB lookups.

Affected files:
- `gateway/src/middleware/anomaly.rs` — `record_and_check()` signature updated
  to accept `project_id: &str`; key format changed
- `gateway/src/proxy/handler.rs` — call site updated to pass `token.project_id`
- `gateway/src/api/handlers.rs` — SCAN pattern uses project-scoped prefix

Test added: `test_anomalies_scoped_to_project`

---

### Added

- `Db::get_approval_request(id)` — fetches a single approval request by UUID for
  ownership verification in the approval decision handler
- `Db::policy_belongs_to_project(policy_id, project_id)` — checks if a policy
  belongs to a specific project; used by the policy versions ownership check
- `docs/reference/security.md` — new "Authorization Model" section documenting
  role vs scope semantics, 404-on-mismatch semantics, SuperAdmin scope behavior,
  and anomaly key schema requirements for future contributors
