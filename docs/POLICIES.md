# AIlink — Policy Guide

> Policies define **what** an agent can do with a token.

## Structure

Policies are written in YAML or JSON. Each policy has a `mode` (Enforce or Shadow) and a list of `rules`.

```yaml
name: "stripe-billing-worker"
mode: "enforce"  # or "shadow" - log violations but allow request
rules:
  - type: method_whitelist
    methods: ["GET", "POST"]
  
  - type: path_whitelist
    patterns: 
      - "/v1/charges/*"
      - "/v1/customers/*"

  - type: rate_limit
    window: "1m"
    max_requests: 100

  - type: spend_cap
    window: "24h"
    max_usd: 50.00
```

---

## Shadow Mode

Set `mode: "shadow"` for safe deployment.

If a request violates a Shadow Mode policy, AIlink will:
1. Log a `shadow_deny` event to the audit trail.
2. Allow the request to proceed.

This lets you verify that a policy won't break your agent before enforcing it.

---

## Rule Types

### 1. Method Whitelist
Restricts HTTP methods.

```yaml
- type: method_whitelist
  methods: ["GET"]
```

### 2. Path Whitelist
Restricts URL paths using wildcards (`*`).

```yaml
- type: path_whitelist
  patterns: ["/v1/repos/*/issues", "/user/*"]
```

### 3. Rate Limit
Limits requests per time window.

| Window | Example |
|---|---|
| Seconds | "10s" |
| Minutes | "5m" |
| Hours | "1h" |

```yaml
- type: rate_limit
  window: "1m"
  max_requests: 60
```

### 4. Spend Cap (Estimated)
Limits total API spend based on provider pricing models.

AIlink estimates cost based on token usage (LLMs) or request count (SaaS APIs).

```yaml
- type: spend_cap
  window: "24h"
  max_usd: 10.00
```

### 5. Time Window
Restricts access to specific days and times (e.g., business hours only).

```yaml
- type: time_window
  timezone: "UTC"
  allow:
    - days: ["Mon", "Tue", "Wed", "Thu", "Fri"]
      hours: ["09:00", "17:00"]
```

### 6. Human Approval (HITL)
Pauses specific requests for manual approval via Slack/Dashboard.

```yaml
- type: human_approval
  trigger:
    methods: ["DELETE"]
    paths: ["/v1/customers/*"]
  timeout: "10m"
```

### 7. IP Allowlist
Restricts access to specific source IP ranges (CIDR).

```yaml
- type: ip_allowlist
  cidrs: ["10.0.0.0/8", "192.168.1.50/32"]
```
