# AIlink — API Reference

> This reference covers the Management API for configuring AIlink. For making requests *through* the gateway, see the [SDK Guide](SDK.md).

## Management API

The Management API controls the gateway's configuration: tokens, policies, credentials, and audit logs.

**Base URL**: `http://localhost:8443/api/v1` (default)
**Auth**: `Authorization: Bearer <management_token>`

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

#### Delete Project
`DELETE /projects/{id}`

---

### Tokens

Virtual tokens provided to agents.

#### List Tokens
`GET /tokens?project_id={uuid}`

Returns a list of active tokens for a project.

#### Create Token
`POST /tokens`

Create a new virtual token linked to a real credential.

```json
{
  "project_id": "uuid",
  "name": "billing-agent-prod",
  "credential_id": "stripe-live-sk",
  "upstream_url": "https://api.stripe.com",
  "upstreams": [
    { "url": "https://api.primary.com", "weight": 70, "priority": 1 },
    { "url": "https://api.backup.com", "weight": 30, "priority": 1 }
  ],
  "policies": ["policy-uuid-1", "policy-uuid-2"],
  "scopes": ["read", "write"],
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 3,
    "recovery_cooldown_secs": 30,
    "half_open_max_requests": 1
  }
}
```

All `circuit_breaker` fields are optional — omit to use gateway defaults (`enabled: true`, threshold: 3, cooldown: 30s). To disable circuit breaking for a dev/test token, pass `{"enabled": false}`.

**Response**:
```json
{
  "id": "ailink_v1_proj_abc123_tok_xyz789",
  "created_at": "2026-02-14T10:00:00Z"
}
```

#### Revoke Token
`DELETE /tokens/{token_id}`

Immediately invalidates the token. Active connections are terminated.

#### Rotate Underlying Key
`POST /tokens/{token_id}/rotate`

Triggers an immediate rotation of the *real* credential associated with this token. The virtual token ID (`ailink_v1_...`) remains unchanged, so the agent doesn't need a restart.

---

### Circuit Breaker

Per-token circuit breaker configuration. Controls how the load balancer handles unhealthy upstreams.

#### Get Circuit Breaker Config
`GET /tokens/{token_id}/circuit-breaker`

Returns the current circuit breaker configuration for a token.

**Response:**
```json
{
  "enabled": true,
  "failure_threshold": 3,
  "recovery_cooldown_secs": 30,
  "half_open_max_requests": 1
}
```

#### Update Circuit Breaker Config
`PATCH /tokens/{token_id}/circuit-breaker`

Update circuit breaker settings at runtime — no gateway restart required.

```json
{
  "enabled": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | bool | `true` | Toggle CB on/off per token |
| `failure_threshold` | int | `3` | Consecutive failures before circuit opens |
| `recovery_cooldown_secs` | int | `30` | Seconds before retrying an unhealthy upstream |
| `half_open_max_requests` | int | `1` | Requests allowed in half-open state |

> **Response headers on every proxied request:**
> - `X-AILink-CB-State: closed | open | half_open | disabled`
> - `X-AILink-Upstream: https://api.primary.com/v1`

---

### Spend Caps

Manage monetary limits for tokens.

#### Get Spend Caps
`GET /tokens/{token_id}/spend`

Returns current configuration and usage.

#### Upsert Spend Cap
`PUT /tokens/{token_id}/spend`

Sets a daily or monthly limit.

```json
{
  "period": "daily", // or "monthly"
  "limit_usd": 50.00
}
```

**Note**: `limit_usd` must be positive. Zero or negative values return `422 Unprocessable Entity`.

#### Remove Spend Cap
`DELETE /tokens/{token_id}/spend/{period}`

Removes the limit for the specified period (`daily` or `monthly`).

---

### Policies

Defined rules for what a token can do.

#### Create Policy
`POST /policies`

```json
{
  "project_id": "uuid",
  "name": "stripe-read-only",
  "mode": "enforce",
  "rules": [
    {
      "when": { "field": "method", "op": "eq", "value": "GET" },
      "then": { "action": "allow" }
    },
    {
      "when": { "always": true },
      "then": { "action": "rate_limit", "window": "1m", "max_requests": 60 }
    }
  ]
}
```

#### Update Policy Mode
`PATCH /policies/{policy_id}`

Useful for promoting a policy from Shadow Mode to Enforce Mode.

```json
{
  "mode": "enforce"
}
```

---

### Credentials

Real API keys stored in the vault.

#### Add Credential
`POST /credentials`

```json
{
  "project_id": "uuid",
  "name": "stripe-live-sk",
  "provider": "stripe",
  "ciphertext": "sk_live_...", // Sent over TLS, encrypted immediately
  "rotation_config": {
    "enabled": true,
    "interval": "24h"
  }
}
```

#### List Credentials
`GET /credentials`

Returns metadata only (names, providers, rotation status). **Never returns the secret key.**

---

### Services (Action Gateway)

Register external APIs as named services. The gateway proxies requests and injects credentials automatically.

#### List Services
`GET /services`

Returns all registered services for the current project.

**Response**:
```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "name": "stripe",
    "description": "Payment processing",
    "base_url": "https://api.stripe.com",
    "service_type": "generic",
    "credential_id": "uuid",
    "is_active": true,
    "created_at": "2026-02-18T10:00:00Z",
    "updated_at": "2026-02-18T10:00:00Z"
  }
]
```

#### Create Service
`POST /services`

```json
{
  "name": "stripe",
  "base_url": "https://api.stripe.com",
  "description": "Payment processing",
  "service_type": "generic",
  "credential_id": "uuid"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique name (used in proxy URL path) |
| `base_url` | yes | Upstream root URL |
| `description` | no | Human-readable description |
| `service_type` | no | `"generic"` (default) or `"llm"` |
| `credential_id` | no | Credential to inject when proxying |

#### Delete Service
`DELETE /services/{id}`

Removes a registered service. Existing proxy requests in flight are not affected.

#### Proxy Through a Service
`ANY /v1/proxy/services/{service_name}/*`

Routes the request to the service's `base_url` with the linked credential injected. The path after the service name is appended to the base URL.

**Example**: `POST /v1/proxy/services/stripe/v1/charges` → `POST https://api.stripe.com/v1/charges`

---

### Human-in-the-Loop (HITL)

Manage pending approval requests.

#### List Pending Approvals
`GET /approvals?status=pending`

#### Approve Request
`POST /approvals/{request_id}/approve`

Resumes the blocked request.

#### Reject Request
`POST /approvals/{request_id}/reject`

The agent receives a `403 Forbidden`.

---

### Audit

#### Query Logs
`GET /audit/logs`

**Parameters**:
- `limit`: Max records (default 50)
- `offset`: Pagination offset (default 0)
- `project_id`: Filter by project

---

### Analytics

#### Request Volume
`GET /analytics/volume`

Returns request counts bucketed by hour for the last 24h.

#### Status Distribution
`GET /analytics/status`

Returns count of requests by HTTP status code (2xx, 4xx, 5xx).

#### Latency Percentiles
`GET /analytics/latency`

Returns P50, P90, P99, and Mean latency in milliseconds.

---

### Health

#### Liveness
`GET /healthz`
Returns `200 OK` if the process is running.

#### Readiness
`GET /readyz`
Returns `200 OK` if the gateway can connect to Postgres and Redis.

#### Upstream Health
`GET /health/upstreams`

Returns the circuit breaker health status of all tracked upstream targets across all tokens.

**Response:**
```json
[
  {
    "token_id": "ailink_v1_proj_abc_tok_xyz",
    "url": "https://api.openai.com",
    "is_healthy": true,
    "failure_count": 0,
    "cooldown_remaining_secs": null
  },
  {
    "token_id": "ailink_v1_proj_abc_tok_xyz",
    "url": "https://api.backup.com",
    "is_healthy": false,
    "failure_count": 3,
    "cooldown_remaining_secs": 18
  }
]
```
