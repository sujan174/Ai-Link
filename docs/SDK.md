# AIlink — SDK Guide

> SDKs for Python and TypeScript. Use AIlink from your AI agents with one line of code.

---

## Python SDK

### Installation

```bash
pip install ailink
```

### Quick Start

#### Explicit Client (Recommended)

Use the `AIlinkClient` to proxy requests.

```python
from ailink import AIlinkClient

client = AIlinkClient(
    token="ailink_v1_proj_abc123_tok_def456",
    gateway_url="https://gateway.ailink.dev",
    agent_name="billing-agent",  # shows up in audit logs
)

# GET request
customers = client.get("/v1/customers")

# POST request
charge = client.post("/v1/charges", json={
    "amount": 5000,
    "currency": "usd",
    "customer": "cus_abc123",
})
```

#### Option 3: LangChain Integration

```python
from ailink.integrations import langchain_tool

stripe_tool = langchain_tool(
    token="ailink_v1_proj_abc123_tok_stripe",
    name="stripe_api",
    description="Make Stripe API calls for billing operations",
    methods=["GET", "POST"],
)

# Use in a LangChain agent
from langchain.agents import create_react_agent
agent = create_react_agent(llm, tools=[stripe_tool])
```

#### Option 4: CrewAI Integration

```python
from ailink.integrations import crewai_tool

github_tool = crewai_tool(
    token="ailink_v1_proj_abc123_tok_github",
    name="github_api",
    description="Interact with GitHub repositories",
)

# Use in a CrewAI agent
from crewai import Agent
dev_agent = Agent(
    role="Developer",
    tools=[github_tool],
)
```

### HITL (Human-in-the-Loop) Handling

When a request triggers an approval policy, the gateway returns `202 Accepted` instead of the usual response. The SDK provides two ways to handle this.

#### Async Mode (Recommended)

```python
response = client.post("/v1/charges", json={"amount": 50000})

if response.status_code == 202:
    # Request is pending human approval
    request_id = response.json()["request_id"]
    print(f"Waiting for approval: {request_id}")

    # Poll until approved, rejected, or timeout
    result = await client.wait_for_approval(request_id, timeout=300)

    if result.approved:
        print(f"Approved! Response: {result.response.json()}")
    else:
        print(f"Rejected: {result.reason}")
```

#### Sync Mode (Blocking)

```python
# Blocks the thread until approved/rejected/timeout
response = client.post(
    "/v1/charges",
    json={"amount": 50000},
    wait_for_approval=True,
    approval_timeout=300,  # 5 minutes
)
# response is the final result (200, 403, or 408)
```

### Idempotency Keys

When HITL is involved, always use idempotency keys to prevent duplicate operations on retry:

```python
response = client.post(
    "/v1/charges",
    json={"amount": 5000},
    idempotency_key="charge-order-12345",  # unique per operation
)
```

### Error Handling

```python
from ailink import AIlinkError, PolicyDeniedError, ApprovalTimeoutError

try:
    response = client.post("/v1/charges", json={"amount": 5000})
except PolicyDeniedError as e:
    print(f"Blocked by policy: {e.policy_name} — {e.reason}")
    # e.g., "method_not_allowed", "rate_limit_exceeded", "spend_cap_reached"
except ApprovalTimeoutError as e:
    print(f"Approval timed out after {e.timeout}s")
except AIlinkError as e:
    print(f"Gateway error: {e}")
```

### Configuration

```python
client = AIlinkClient(
    api_key="ailink_v1_...",
    gateway_url="https://gateway.ailink.dev",  # default
    agent_name="my-agent",                      # for audit logs
    timeout=30,                                  # request timeout (seconds)
    retries=3,                                   # automatic retries on 5xx
    verify_ssl=True,                             # TLS verification
)
```

---

## TypeScript SDK

### Installation

```bash
npm install @ailink/sdk
```

### Quick Start

```typescript
import { AIlink } from '@ailink/sdk';

const client = new AIlink({
  token: 'ailink_v1_proj_abc123_tok_def456',
  gatewayUrl: 'https://gateway.ailink.dev',
  agentName: 'billing-agent',
});

// GET
const customers = await client.get('/v1/customers');

// POST
const charge = await client.post('/v1/charges', {
  body: { amount: 5000, currency: 'usd' },
});

// With HITL approval
const result = await client.post('/v1/charges', {
  body: { amount: 50000, currency: 'usd' },
  waitForApproval: true,
  approvalTimeout: 300,
  idempotencyKey: 'charge-order-12345',
});
```

### Error Handling

```typescript
import { AIlinkError, PolicyDeniedError, ApprovalTimeoutError } from '@ailink/sdk';

try {
  const response = await client.post('/v1/charges', { body: { amount: 5000 } });
} catch (error) {
  if (error instanceof PolicyDeniedError) {
    console.error(`Blocked: ${error.policyName} — ${error.reason}`);
  } else if (error instanceof ApprovalTimeoutError) {
    console.error(`Approval timed out`);
  }
}
```

---

## Project Management

Manage projects programmatically via the SDK (Admin Key required).

```python
admin = AIlinkClient.admin(admin_key="ailink_admin_...")

# List projects
projects = admin.projects.list()

# Create a project
new_proj = admin.projects.create(name="finance-bot")
project_id = new_proj["id"]

# Delete a project
admin.projects.delete(project_id)
```

---

## Service Registry (Action Gateway)

Register external APIs as named services. The gateway will proxy requests and automatically inject the linked credential.

### Register a Service

```python
admin = AIlinkClient.admin(admin_key="ailink_admin_...")

# Register Stripe
admin.services.create(
    name="stripe",
    base_url="https://api.stripe.com",
    description="Payment processing",
    service_type="generic",        # or "llm"
    credential_id="cred-uuid",     # auto-injected on proxy
)

# Register Slack (no credential needed for public webhooks)
admin.services.create(
    name="slack-webhook",
    base_url="https://hooks.slack.com",
    description="Slack notifications",
)
```

### List and Delete Services

```python
# List all registered services
services = admin.services.list()
for svc in services:
    print(f"{svc.name} → {svc.base_url} ({svc.service_type})")

# Delete a service
admin.services.delete(service_id="svc-uuid")
```

### Proxy Through a Service

Once registered, agents proxy requests via `/v1/proxy/services/{name}/...`:

```python
agent = AIlinkClient(api_key="ailink_v1_...", agent_name="billing-bot")

# Request is proxied to https://api.stripe.com/v1/charges
# with the linked credential injected automatically
charges = agent.post("/v1/proxy/services/stripe/v1/charges", json={
    "amount": 5000,
    "currency": "usd",
})
```

This replaces the need for separate tokens per API — one token can access multiple services.

### Service Model Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Service UUID |
| `name` | string | Unique name (used in proxy URL) |
| `base_url` | string | Upstream root URL |
| `description` | string | Human-readable description |
| `service_type` | string | `"generic"` or `"llm"` |
| `credential_id` | string? | Linked credential (auto-injected) |
| `is_active` | bool | Whether the service is active |
| `created_at` | datetime | Creation timestamp |

---

## Multiple APIs in One Agent

### Option A: Service Registry (Recommended)

Register services once, then use a single token to access all of them:

```python
from ailink import AIlinkClient

agent = AIlinkClient(api_key="ailink_v1_...", agent_name="billing-bot")

# Each request routes to the correct upstream via the service name
charges = agent.post("/v1/proxy/services/stripe/v1/charges", json={...})
repos   = agent.get("/v1/proxy/services/github/user/repos")
agent.post("/v1/proxy/services/slack/api/chat.postMessage", json={
    "channel": "#billing", "text": "Done!"
})
```

### Option B: Separate Tokens

Use separate tokens per API, each with their own upstream and policies:

```python
from ailink import AIlinkClient

stripe = AIlinkClient(api_key="ailink_v1_proj_abc_tok_stripe", agent_name="billing-bot")
github = AIlinkClient(api_key="ailink_v1_proj_abc_tok_github", agent_name="billing-bot")
slack  = AIlinkClient(api_key="ailink_v1_proj_abc_tok_slack",  agent_name="billing-bot")

charges = stripe.get("/v1/charges")
repos = github.get("/user/repos")
slack.post("/api/chat.postMessage", json={"channel": "#billing", "text": "Done!"})
```
