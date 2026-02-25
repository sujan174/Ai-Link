# AIlink — SDK Guide

> SDKs for Python and TypeScript. Use AIlink from your AI agents with one line of code.

---

## Python SDK

### Installation

```bash
pip install ailink
```

### Quick Start

#### LLM Gateway (Universal Model Proxy)

AIlink is a **drop-in replacement** for any OpenAI-compatible endpoint. Point your existing SDK at the gateway and use any model — OpenAI, Anthropic Claude, or Google Gemini — with the same API. The gateway auto-detects the provider from the model name and handles all format translation transparently.

**Drop-in with the OpenAI SDK:**

```python
import openai
from ailink import AIlinkClient

# One line to get a policy-enforced, audited OpenAI client
client = AIlinkClient(api_key="ailink_v1_...", gateway_url="https://gateway.ailink.dev")
oai = client.openai()

# Use exactly like openai.Client — no other changes needed
response = oai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarise this contract."}],
)
```

**Switch to Claude or Gemini — same code, just change the model name:**

```python
# Anthropic Claude — gateway translates OpenAI format → Messages API automatically
response = oai.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Summarise this contract."}],
)

# Google Gemini — gateway translates to generateContent API automatically
response = oai.chat.completions.create(
    model="gemini-2.0-flash",
    messages=[{"role": "user", "content": "Summarise this contract."}],
)
```

> The gateway detects the provider from the model name prefix (`claude-*` → Anthropic, `gemini-*` → Google, `gpt-*` / `o1-*` / `o3-*` → OpenAI) and rewrites the request/response format on the fly. Your code never changes.

**Streaming:**

```python
stream = oai.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Write a poem."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

**Async:**

```python
from ailink import AsyncClient

async with AsyncClient(api_key="ailink_v1_...", gateway_url="https://gateway.ailink.dev") as client:
    oai = client.openai()
    response = await oai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
```

**Supported models (auto-detected):**

| Prefix | Provider | Example models |
|--------|----------|----------------|
| `gpt-*`, `o1-*`, `o3-*`, `o4-*` | OpenAI | `gpt-4o`, `o3-mini` |
| `claude-*` | Anthropic | `claude-3-5-sonnet-20241022`, `claude-3-haiku` |
| `gemini-*` | Google | `gemini-2.0-flash`, `gemini-1.5-pro` |
| *(custom)* | Groq, Mistral, Cohere, Ollama | (Configured via upstream URL on token) |

---

### Batches & Fine-Tuning

AIlink fully supports proxying OpenAI's `/v1/batches` and `/v1/fine_tuning` APIs. Ensure your underlying token credential supports these endpoints.

```python
# Create a batch
batch = oai.batches.create(
    input_file_id="file-xyz",
    endpoint="/v1/chat/completions",
    completion_window="24h"
)

# Start a fine-tuning job
job = oai.fine_tuning.jobs.create(
    training_file="file-abc",
    model="gpt-4o-mini-2024-07-18"
)
```

---

### Realtime API (WebSocket)

AIlink provides a transparent bidding WS proxy for the OpenAI Realtime API. Use the `realtime` client wrapper:

```python
async with client.realtime("gpt-4o-realtime-preview") as ws:
    await ws.send({"type": "session.update", ...})
    event = await ws.recv()
```

---

#### Action Gateway (API Proxy)

Use the `AIlinkClient` to proxy requests to any REST API.

```python
from ailink import AIlinkClient

client = AIlinkClient(
    api_key="ailink_v1_proj_abc123_tok_def456",
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

#### LangChain Integration

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

#### CrewAI Integration

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

### Response Caching
The gateway automatically caches identical LLM responses to save costs and reduce latency. To force a fresh response (bypass cache):

```python
response = client.post(
    "/v1/chat/completions",
    json={...},
    headers={"x-ailink-no-cache": "true"}
)
```

Cache hits are indicated by the `x-ailink-cache: HIT` header in the response.

---

### Circuit Breaker

AIlink has a built-in circuit breaker that stops requests to repeatedly-failing upstreams and automatically recovers them after a cooldown. It's configurable **per token** and can be toggled at runtime.

#### Create token with custom CB config

```python
admin = AIlinkClient.admin(admin_key="ailink_admin_...")

token = admin.tokens.create(
    name="prod-gpt",
    upstream_url="https://api.openai.com/v1",
    credential_id="cred-uuid",
    # tighter thresholds for high-stakes environments
    circuit_breaker={
        "enabled": True,
        "failure_threshold": 5,
        "recovery_cooldown_secs": 60,
    },
)

# Or disable CB entirely for dev tokens:
dev_token = admin.tokens.create(
    name="dev-test",
    upstream_url="https://api.openai.com/v1",
    circuit_breaker={"enabled": False},
)
```

#### Read and update CB config at runtime

```python
# Read current config
config = admin.tokens.get_circuit_breaker(token["token_id"])
print(config)  # {"enabled": True, "failure_threshold": 5, ...}

# Update at runtime (no restart needed)
updated = admin.tokens.set_circuit_breaker(
    token["token_id"],
    enabled=True,
    failure_threshold=3,
    recovery_cooldown_secs=30,
    half_open_max_requests=1,
)
```

#### Check upstream health across all tokens

```python
health = admin.tokens.upstream_health()
for entry in health:
    status = "✅" if entry["is_healthy"] else f"❌ (cooldown: {entry['cooldown_remaining_secs']}s)"
    print(f"{entry['url']} [{entry['token_id']}] {status}")
```

#### Read CB state from response headers

Every proxied request returns these headers:
```
X-AILink-CB-State: closed | open | half_open | disabled
X-AILink-Upstream: https://api.openai.com/v1
```

#### Async

```python
from ailink import AsyncClient

async with AsyncClient.admin(admin_key="ailink_admin_...") as admin:
    config  = await admin.tokens.get_circuit_breaker("ailink_v1_...")
    health  = await admin.tokens.upstream_health()
    updated = await admin.tokens.set_circuit_breaker(
        "ailink_v1_...", enabled=False
    )
```
---

## ⚡ Gateway Resilience & Fallback

> **Best practice**: Always write fallback code for when the AIlink gateway is temporarily unavailable. Your agents should degrade gracefully — not stop working.

> [!IMPORTANT]
> When the gateway is bypassed, requests go **directly to the LLM provider** — **no policy enforcement, no audit logs, no spend tracking**. Treat fallback as an emergency path only.

---

### Pattern 1 — One-time check (`is_healthy`)

Fastest, simplest option. Best for a single call:

```python
import os, openai
from ailink import AIlinkClient

client       = AIlinkClient(api_key="ailink_v1_...")
fallback_oai = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

if client.is_healthy():              # fast 3s timeout, never raises
    oai = client.openai()            # audited, policy-enforced
else:
    oai = fallback_oai               # emergency direct bypass
    print("⚠️  AIlink gateway unreachable — running without policy enforcement")

response = oai.chat.completions.create(model="gpt-4o", messages=[...])
```

---

### Pattern 2 — Automatic fallback (`with_fallback`)

Zero boilerplate. Checks health and yields the right client automatically:

```python
import os, openai
from ailink import AIlinkClient

client       = AIlinkClient(api_key="ailink_v1_...")
fallback_oai = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

with client.with_fallback(fallback_oai) as oai:
    # oai = client.openai()  if gateway healthy
    # oai = fallback_oai     if gateway down (emits a UserWarning)
    response = oai.chat.completions.create(model="gpt-4o", messages=[...])
```

---

### Pattern 3 — Background polling (`HealthPoller`)

Best for **long-running services**. Health state is cached — zero added latency per request:

```python
import os, openai
from ailink import AIlinkClient, HealthPoller

client   = AIlinkClient(api_key="ailink_v1_...")
fallback = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

with HealthPoller(client, interval=15) as poller:   # polls every 15s in background
    for user_message in incoming_messages():
        oai = client.openai() if poller.is_healthy else fallback
        response = oai.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": user_message}])
        yield response
```

---

### Pattern 4 — Async

```python
import os, openai
from ailink import AsyncClient, AsyncHealthPoller

client   = AsyncClient(api_key="ailink_v1_...")
fallback = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

# One-shot
if await client.is_healthy():
    oai = client.openai()
else:
    oai = fallback

# Auto fallback context manager
async with client.with_fallback(fallback) as oai:
    response = await oai.chat.completions.create(model="gpt-4o", messages=[...])

# Background poller
async with AsyncHealthPoller(client, interval=15) as poller:
    oai = client.openai() if poller.is_healthy else fallback
    response = await oai.chat.completions.create(model="gpt-4o", messages=[...])
```

---

### Resilience Best Practices

| ✅ Do | ❌ Don't |
|-------|---------|
| Always define a `fallback_oai` client | Let your agent crash if the gateway restarts |
| Log or alert when falling back | Silently bypass in normal operation |
| Use `HealthPoller` in long-running services | Call `is_healthy()` inside a tight loop |
| Set polling interval ≥ 10 seconds | Poll faster than every 5 seconds |
| Test fallback paths in CI | Assume the gateway is always up |

---

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

### Passthrough Mode (Bring Your Own Key)

When a token has **no stored credential**, the gateway operates in passthrough mode — it forwards requests to the upstream without injecting a key. Use `with_upstream_key()` to supply the upstream API key at call time, so it never needs to be stored in AIlink.

This is "Double Auth": the AIlink token authenticates you **to the gateway**, and your upstream key authenticates the gateway **to the provider**.

```python
client = AIlinkClient(
    api_key="ailink_v1_...",   # AIlink token (no credential attached)
    gateway_url="https://gateway.ailink.dev",
)

# The upstream key is sent as X-Real-Authorization and forwarded to the provider
with client.with_upstream_key("sk-my-openai-key") as byok:
    resp = byok.post("/v1/chat/completions", json={
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Hello"}],
    })
```

By default, the `with_upstream_key` context manager enforces that the underlying token has `credential_id == None` (a strict passthrough un-bound token). If you want to allow overriding an existing credential, pass `allow_override=True`.

The `header` argument controls the auth scheme (default `"Bearer"`). For APIs that use a raw key:

```python
with client.with_upstream_key("my-api-key", header="") as byok:
    resp = byok.get("/v1/data")
```

**Async:**

```python
async with client.with_upstream_key("sk-my-key") as byok:
    resp = await byok.post("/v1/chat/completions", json={...})
```

---

### Session Tracing

Use `trace()` to correlate all requests in a multi-step agent workflow. Every request inside the block is tagged with the same `x-session-id`, which appears in audit logs so you can filter and replay entire conversations.

```python
# session_id is auto-generated if omitted
with client.trace(session_id="conv-abc123") as t:
    t.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "Step 1"}]})
    t.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "Step 2"}]})
    # Both requests share session_id="conv-abc123" in audit logs
```

For nested traces (e.g. a sub-agent spawned by a parent), pass `parent_span_id`:

```python
with client.trace(session_id="conv-abc123", parent_span_id="span-root-001") as t:
    t.post("/v1/chat/completions", json={...})
```

**Async:**

```python
async with client.trace(session_id="conv-abc123") as t:
    await t.post("/v1/chat/completions", json={...})
```

**Composable** — stack both context managers for traced BYOK requests:

```python
with client.with_upstream_key("sk-my-key") as byok_client:
    with byok_client.trace(session_id="conv-xyz") as t:
        t.post("/v1/chat/completions", json={...})
```

> **Audit log fields:** `session_id` and `parent_span_id` are stored on every audit log entry and can be filtered via the Management API.

---

### Ad-hoc Guardrails (Per-Request)

You can apply specific guardrail presets on a per-request basis using the `with_guardrails` context manager. This overrides the default presets (if any) configured on the token.

```python
# Apply PII redaction and Prompt Injection checks just for this request
with client.with_guardrails(["pii_redaction", "prompt_injection"]) as g:
    response = g.openai().chat.completions.create(...)
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

## Configuration Management

Manage AIlink configuration programmatically, enabling Config-as-Code setups.

### Config Export / Import

Export projects, tokens, and policies as YAML config files that can be committed to a git repository, and import them seamlessly.

```python
admin = AIlinkClient.admin(admin_key="ailink_admin_...")

# Export all configuration as YAML string
yaml_config = admin.config.export()
with open("ailink_config.yaml", "w") as f:
    f.write(yaml_config)

# Import and apply configuration from YAML string
with open("ailink_config.yaml", "r") as f:
    import_result = admin.config.import_yaml(f.read())
    print(import_result)
```

### Guardrail Operations

Enable bundled guardrail presets on a token programmatically. The gateway detects drift if modified outside SDK code.

```python
# Enable guardrails (idempotent, records source as 'sdk')
admin.guardrails.enable("ailink_v1_tok_xyz", ["pii_redaction", "prompt_injection"])

# Disable
admin.guardrails.disable("ailink_v1_tok_xyz")

# Get status and active presets
status = admin.guardrails.status("ailink_v1_tok_xyz")
print(status.presets)
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
