# AIlink — API Reference

> This reference covers the Management API for configuring AIlink. For making requests *through* the gateway, see the [SDK Guide](SDK.md).

## Management API

Base URL: `http://localhost:8443/api/v1`  
Auth: `Authorization: Bearer <api_key>` (create keys via `/auth/keys`)

---

### API Keys (Admin Auth)

Manage programmatic access keys for the Management API.

#### List API Keys
`GET /auth/keys`

#### Create API Key
`POST /auth/keys`

```json
{ "name": "ci-pipeline", "role": "admin", "scopes": ["tokens:write", "policies:read"] }
```

Roles: `admin` (full access within org), `member` (read/write, no delete), `read_only`.

#### Revoke API Key
`DELETE /auth/keys/{id}`

#### Who Am I
`GET /auth/whoami` — Returns current auth context (org_id, role, scopes).

---

### Projects

Logical groups for tokens and policies.

#### List Projects
`GET /projects`

#### Create Project
`POST /projects`
```json
{ "name": "finance-team" }
```

#### Update Project
`PUT /projects/{id}`

#### Delete Project
`DELETE /projects/{id}`

#### Purge Project Data (GDPR)
`POST /projects/{id}/purge`

Permanently erases all audit logs, sessions, and usage data for a project. Irreversible. Implements GDPR Article 17 (Right to Erasure).

---

### Tokens

Virtual tokens issued to AI agents. Agents use these instead of real API keys.

#### List Tokens
`GET /tokens`

#### Get Token
`GET /tokens/{id}`

#### Create Token
`POST /tokens`

```json
{
  "name": "billing-agent-prod",
  "credential_id": "uuid",
  "upstream_url": "https://api.openai.com",
  "upstreams": [
    { "url": "https://api.primary.com", "weight": 70, "priority": 1 },
    { "url": "https://api.backup.com", "weight": 30, "priority": 1 }
  ],
  "policy_ids": ["policy-uuid-1"],
  "log_level": 0,
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 3,
    "recovery_cooldown_secs": 30,
    "half_open_max_requests": 1
  }
}
```

#### Revoke Token
`DELETE /tokens/{id}`

#### Get Token Usage
`GET /tokens/{id}/usage`

---

### Circuit Breaker

Per-token circuit breaker configuration for upstream resilience.

#### Get Circuit Breaker Config
`GET /tokens/{id}/circuit-breaker`

```json
{
  "enabled": true,
  "failure_threshold": 3,
  "recovery_cooldown_secs": 30,
  "half_open_max_requests": 1
}
```

#### Update Circuit Breaker Config
`PATCH /tokens/{id}/circuit-breaker`

Update at runtime without gateway restart. CB states: `closed` → `open` (after N failures) → `half_open` (cooldown elapsed) → `closed`.

> Response headers on every proxied request:
> - `X-AILink-CB-State: closed | open | half_open | disabled`
> - `X-AILink-Upstream: https://api.primary.com`

---

### Spend Caps

Monetary limits per token (enforced atomically via Redis Lua scripts).

#### Get Spend Caps
`GET /tokens/{id}/spend`

```json
{
  "daily_limit_usd": 50.0,
  "monthly_limit_usd": 500.0,
  "current_daily_usd": 12.34,
  "current_monthly_usd": 89.01
}
```

#### Set Spend Cap
`PUT /tokens/{id}/spend`
```json
{ "period": "daily", "limit_usd": 50.00 }
```

#### Remove Spend Cap
`DELETE /tokens/{id}/spend/{period}` — `period` is `daily` or `monthly`.

---

### Policies

Traffic control rules. Bind conditions (method, path, spend, time) to actions (deny, rate_limit, redact, webhook, transform).

#### List Policies
`GET /policies`

#### Create Policy
`POST /policies`

```json
{
  "name": "prod-safety",
  "mode": "enforce",
  "rules": [
    {
      "when": { "field": "request.body.messages[0].content", "op": "contains", "value": "sk_live" },
      "then": { "action": "deny", "message": "Cannot forward API keys" }
    }
  ]
}
```

Modes: `enforce` (blocks/modifies), `shadow` (logs only — safe rollout).

#### Update Policy
`PUT /policies/{id}`

#### Delete Policy
`DELETE /policies/{id}`

#### List Policy Versions
`GET /policies/{id}/versions` — Full audit trail of every policy change.

---

### Credentials

Real API keys stored in the vault (AES-256-GCM envelope encrypted — never returned in plaintext).

#### List Credentials
`GET /credentials` — Returns metadata only (name, provider, rotation status).

#### Create Credential
`POST /credentials`
```json
{
  "name": "openai-prod",
  "provider": "openai",
  "secret": "sk_live_...",
  "injection_mode": "header",
  "injection_header": "Authorization"
}
```

| Field | Default | Description |
|---|---|---|
| `name` | required | Display name |
| `provider` | required | Provider identifier (e.g., `openai`, `anthropic`, `stripe`) |
| `secret` | required | The real API key (encrypted at rest) |
| `injection_mode` | `"header"` | How the secret is injected: `"header"` or `"query"` |
| `injection_header` | `"Authorization"` | Header name for injection (when mode is `"header"`) |

#### Delete Credential
`DELETE /credentials/{id}`

---

### Guardrail Presets

One-call safety rule bundles (PII, prompt injection, HIPAA, etc.). Backed by 100+ patterns across 22 preset categories.

#### List Available Presets
`GET /guardrails/presets`

#### Enable Guardrails
`POST /guardrails/enable`
```json
{
  "token_id": "ailink_v1_...",
  "presets": ["pii_redaction", "prompt_injection", "hipaa"],
  "source": "dashboard",
  "topic_allowlist": ["billing"],
  "topic_denylist": ["competitors"]
}
```

#### Check Guardrail Status
`GET /guardrails/status?token_id={id}`

Returns active presets and source (sdk/dashboard) for drift detection.

#### Disable Guardrails
`DELETE /guardrails/disable` (body: `{"token_id": "..."}`)

---

### MCP Server Management

Register Model Context Protocol servers. The gateway auto-discovers tools and injects them into LLM requests via the `X-MCP-Servers` header.

#### List MCP Servers
`GET /mcp/servers`

#### Register MCP Server
`POST /mcp/servers`
```json
{ "name": "brave", "endpoint": "http://localhost:3001/mcp", "api_key": "optional" }
```

Performs the MCP `initialize` handshake and caches tool schemas. Server names must be alphanumeric (hyphens/underscores allowed).

#### Delete MCP Server
`DELETE /mcp/servers/{id}`

#### Test Connection (without registering)
`POST /mcp/servers/test`

#### Refresh Tool Cache
`POST /mcp/servers/{id}/refresh`

#### List Cached Tools
`GET /mcp/servers/{id}/tools`

**Usage**: Add `X-MCP-Servers: brave,slack` header to any proxy request. Tools are injected as `mcp__brave__search`, `mcp__slack__send_message`, etc. The gateway executes tool calls autonomously (up to 10 iterations).

---

### Human-in-the-Loop (HITL)

High-stakes operations that pause for manual review.

#### List Pending Approvals
`GET /approvals`

#### Decide Approval
`POST /approvals/{id}/decision`
```json
{ "decision": "approved" }
```
Values: `approved` (resumes request), `rejected` (agent receives 403).

---

### Sessions

Tracked multi-turn interactions across the gateway.

#### List Sessions
`GET /sessions?limit=50&offset=0`

#### Get Session Details
`GET /sessions/{id}`

#### Update Session Status
`PATCH /sessions/{id}/status`
```json
{ "status": "paused" }
```
Values: `active`, `paused`, `completed`.

#### Set Session Spend Cap
`PUT /sessions/{id}/spend-cap`

#### Get Session Entity
`GET /sessions/{id}/entity` — Returns real-time cost, token totals, and cap status.

---

### Audit Logs

Immutable request audit trail. Partitioned by month in PostgreSQL.

#### Query Audit Logs
`GET /audit?limit=50&offset=0&token_id={id}`

#### Get Audit Log Detail
`GET /audit/{id}` — Full request/response bodies (if captured at log level ≥ 1).

#### Stream Audit Logs (SSE)
`GET /audit/stream` — Server-sent events for real-time log streaming to the dashboard.

---

### Analytics

#### Request Volume
`GET /analytics/volume` — Hourly request counts (last 24h).

#### Status Distribution
`GET /analytics/status` — Count by HTTP status class (2xx, 4xx, 5xx).

#### Latency Percentiles
`GET /analytics/latency` — P50, P90, P99, mean (ms).

#### Analytics Summary
`GET /analytics/summary` — Aggregated: total requests, errors, cost, tokens.

#### Analytics Timeseries
`GET /analytics/timeseries` — Per-bucket: request count, error count, cost, latency, tokens.

#### Experiments
`GET /analytics/experiments` — A/B model comparison metrics.

#### Token Analytics
`GET /analytics/tokens` — Per-token request volume and error rates.

#### Token Volume
`GET /analytics/tokens/{id}/volume`

#### Token Status
`GET /analytics/tokens/{id}/status`

#### Token Latency
`GET /analytics/tokens/{id}/latency`

#### Spend Breakdown
`GET /analytics/spend/breakdown` — Cost by model, token, or project.

---

### Teams

Organizational hierarchy for multi-team deployments.

#### List Teams
`GET /teams`

#### Create Team
`POST /teams`
```json
{ "name": "platform-team" }
```

#### Update Team
`PUT /teams/{id}`

#### Delete Team
`DELETE /teams/{id}`

#### List Team Members
`GET /teams/{id}/members`

#### Add Team Member
`POST /teams/{id}/members`
```json
{ "user_id": "uuid", "role": "member" }
```

#### Remove Team Member
`DELETE /teams/{id}/members/{user_id}`

#### Team Spend
`GET /teams/{id}/spend` — Aggregate cost for all tokens belonging to the team.

---

### Model Access Groups

Fine-grained RBAC — restrict which models a token or team can access.

#### List Groups
`GET /model-access-groups`

#### Create Group
`POST /model-access-groups`
```json
{ "name": "gpt4-only", "allowed_models": ["gpt-4o", "gpt-4o-mini"] }
```

#### Update Group
`PUT /model-access-groups/{id}`

#### Delete Group
`DELETE /model-access-groups/{id}`

---

### Services (Action Gateway)

Register external APIs for secure, credential-injected proxying.

#### List Services
`GET /services`

#### Create Service
`POST /services`
```json
{
  "name": "stripe",
  "base_url": "https://api.stripe.com",
  "service_type": "generic",
  "credential_id": "uuid"
}
```

#### Delete Service
`DELETE /services/{id}`

#### Proxy Through a Service
`ANY /v1/proxy/services/{service_name}/*`

---

### Webhooks

Event-driven notifications for automated workflows.

#### List Webhooks
`GET /webhooks`

#### Create Webhook
`POST /webhooks`
```json
{ "url": "https://example.com/hook", "events": ["policy_violation", "spend_cap_exceeded"] }
```
Events: `policy_violation`, `spend_cap_exceeded`, `rate_limit_exceeded`, `hitl_requested`, `token_created`.

#### Delete Webhook
`DELETE /webhooks/{id}`

#### Test Webhook
`POST /webhooks/test`
```json
{ "url": "https://example.com/hook" }
```

---

### Model Pricing

Custom cost-per-token overrides for accurate spend tracking.

#### List Pricing
`GET /pricing`

#### Upsert Pricing
`PUT /pricing`
```json
{ "provider": "openai", "model_pattern": "gpt-4o*", "input_per_m": 2.50, "output_per_m": 10.00 }
```
`model_pattern` supports glob matching.

#### Delete Pricing
`DELETE /pricing/{id}`

---

### Notifications

In-app notifications for alerts and events.

#### List Notifications
`GET /notifications`

#### Count Unread
`GET /notifications/unread`

#### Mark Read
`POST /notifications/{id}/read`

#### Mark All Read
`POST /notifications/read-all`

---

### Billing

Organization-level usage and cost tracking.

#### Get Usage
`GET /billing/usage?period=2026-02` — Returns total requests, tokens used, and spend for the given month.

---

### Anomaly Detection

Automatic traffic anomaly detection using sigma-based statistical analysis.

#### Get Anomaly Events
`GET /anomalies`

Returns tokens with anomalous request velocity compared to their baseline. Flags sudden spikes > N standard deviations.

---

### Settings

#### Get Settings
`GET /settings`

#### Update Settings
`PUT /settings`

---

### Config-as-Code

Export/import your full gateway configuration as version-controlled YAML or JSON.

#### Export Full Config
`GET /config/export` (YAML default, `?format=json` for JSON)

#### Export Policies Only
`GET /config/export/policies`

#### Export Tokens Only
`GET /config/export/tokens`

#### Import Config
`POST /config/import` — Upserts policies and creates token stubs.

---

### System

#### Get Cache Statistics
`GET /system/cache-stats` — Redis hit rates, memory usage, namespace breakdown.

#### Flush Cache
`POST /system/flush-cache` — Clears all cached token/policy mappings (use with caution).

#### PII Vault Rehydration
`POST /pii/rehydrate` — Decrypt tokenized PII references (requires `pii:rehydrate` scope).

---

### Health

#### Liveness
`GET /healthz` — 200 OK if process is running.

#### Readiness
`GET /readyz` — 200 OK if Postgres and Redis are reachable.

#### Upstream Health
`GET /health/upstreams` — Circuit breaker health for all tracked upstreams.

```json
[
  {
    "token_id": "ailink_v1_proj_abc_tok_xyz",
    "url": "https://api.openai.com",
    "is_healthy": true,
    "failure_count": 0,
    "cooldown_remaining_secs": null
  }
]
```

---

### Prometheus Metrics

#### Scrape Metrics
`GET /metrics` — Prometheus-compatible text exposition format. No authentication required.

Exposes:
- `ailink_requests_total` — Counter by method, status, token
- `ailink_request_duration_seconds` — Histogram of proxy latency
- `ailink_upstream_errors_total` — Counter by upstream URL and error type
- `ailink_active_tokens` — Gauge of active tokens
- `ailink_cache_hits_total` / `ailink_cache_misses_total` — Response cache counters

---

### SSO / OIDC

Register external identity providers for Single Sign-On.

#### List OIDC Providers
`GET /oidc/providers`

#### Register OIDC Provider
`POST /oidc/providers`
```json
{
  "name": "okta-prod",
  "issuer_url": "https://your-org.okta.com",
  "client_id": "0oa...",
  "client_secret": "...",
  "claim_mappings": {
    "role": "groups",
    "org_id": "org_claim"
  }
}
```

#### Update OIDC Provider
`PUT /oidc/providers/{id}`

#### Delete OIDC Provider
`DELETE /oidc/providers/{id}`

---

### Upstreams

Manage upstream provider configurations and multi-upstream routing.

#### List Upstreams
`GET /upstreams`

#### Create Upstream
`POST /upstreams`
```json
{
  "name": "openai-primary",
  "url": "https://api.openai.com",
  "weight": 70,
  "priority": 1,
  "credential_id": "uuid"
}
```

#### Update Upstream
`PUT /upstreams/{id}`

#### Delete Upstream
`DELETE /upstreams/{id}`
