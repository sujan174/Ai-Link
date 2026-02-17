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
  "policies": ["policy-uuid-1", "policy-uuid-2"],
  "scopes": ["read", "write"]
}
```

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
