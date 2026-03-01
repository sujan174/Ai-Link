# AILink Python SDK

> Drop-in replacement for OpenAI, Anthropic, and Gemini with policy enforcement, audit logging, and spend tracking.

```bash
pip install ailink
```

---

## Quick Start — OpenAI Drop-In

AILink is a **drop-in replacement** for any OpenAI-compatible endpoint. Point your existing SDK at the gateway and use any model — OpenAI, Anthropic Claude, or Google Gemini — with the same API.

```python
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

---

## Streaming

```python
stream = oai.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Write a poem."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

---

## Async

```python
from ailink import AsyncClient

async with AsyncClient(api_key="ailink_v1_...", gateway_url="https://gateway.ailink.dev") as client:
    oai = client.openai()
    response = await oai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
```

---

## Supported Models (Auto-Detected)

| Prefix | Provider | Example models |
|--------|----------|----------------|
| `gpt-*`, `o1-*`, `o3-*`, `o4-*` | OpenAI | `gpt-4o`, `o3-mini` |
| `claude-*` | Anthropic | `claude-3-5-sonnet-20241022`, `claude-3-haiku` |
| `gemini-*` | Google | `gemini-2.0-flash`, `gemini-1.5-pro` |
| *(custom)* | Groq, Mistral, Cohere, Ollama, Bedrock, Together AI, Azure | Configured via upstream URL |

See [Supported Providers](../guides/providers.md) for the full list.

---

## Batches & Fine-Tuning

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

## Realtime API (WebSocket)

```python
async with client.realtime("gpt-4o-realtime-preview") as ws:
    await ws.send({"type": "session.update", ...})
    event = await ws.recv()
```

---

## Action Gateway (API Proxy)

Use the `AIlinkClient` to proxy requests to any REST API:

```python
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

---

## Framework Integrations

### LangChain

```python
from ailink.integrations import langchain_tool

stripe_tool = langchain_tool(
    token="ailink_v1_proj_abc123_tok_stripe",
    name="stripe_api",
    description="Make Stripe API calls for billing operations",
    methods=["GET", "POST"],
)

from langchain.agents import create_react_agent
agent = create_react_agent(llm, tools=[stripe_tool])
```

### CrewAI

```python
from ailink.integrations import crewai_tool

github_tool = crewai_tool(
    token="ailink_v1_proj_abc123_tok_github",
    name="github_api",
    description="Interact with GitHub repositories",
)

from crewai import Agent
dev_agent = Agent(role="Developer", tools=[github_tool])
```

See [Framework Integrations](../guides/framework-integrations.md) for LlamaIndex and Vercel AI SDK.

---

## HITL (Human-in-the-Loop)

### Async Mode (Recommended)

```python
response = client.post("/v1/charges", json={"amount": 50000})

if response.status_code == 202:
    request_id = response.json()["request_id"]
    result = await client.wait_for_approval(request_id, timeout=300)
    if result.approved:
        print(f"Approved! Response: {result.response.json()}")
    else:
        print(f"Rejected: {result.reason}")
```

### Sync Mode (Blocking)

```python
response = client.post(
    "/v1/charges",
    json={"amount": 50000},
    wait_for_approval=True,
    approval_timeout=300,
)
```

### Idempotency Keys

```python
response = client.post(
    "/v1/charges",
    json={"amount": 5000},
    idempotency_key="charge-order-12345",
)
```

---

## Error Handling

```python
from ailink import AIlinkError, PolicyDeniedError, ApprovalTimeoutError

try:
    response = client.post("/v1/charges", json={"amount": 5000})
except PolicyDeniedError as e:
    print(f"Blocked by policy: {e.policy_name} — {e.reason}")
except ApprovalTimeoutError as e:
    print(f"Approval timed out after {e.timeout}s")
except AIlinkError as e:
    print(f"Gateway error: {e}")
```

---

## Response Caching

```python
# Bypass cache for this request
response = client.post(
    "/v1/chat/completions",
    json={...},
    headers={"x-ailink-no-cache": "true"}
)
```

Cache hits are indicated by `x-ailink-cache: HIT` in the response headers.

---

## Gateway Resilience & Fallback

> **Best practice**: Always write fallback code for when the gateway is temporarily unavailable.

> [!IMPORTANT]
> When the gateway is bypassed, requests go **directly to the LLM provider** — **no policy enforcement, no audit logs, no spend tracking**.

### Pattern 1 — One-time check

```python
import os, openai
from ailink import AIlinkClient

client       = AIlinkClient(api_key="ailink_v1_...")
fallback_oai = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

if client.is_healthy():
    oai = client.openai()
else:
    oai = fallback_oai
    print("⚠️  AIlink gateway unreachable — running without policy enforcement")

response = oai.chat.completions.create(model="gpt-4o", messages=[...])
```

### Pattern 2 — Automatic fallback

```python
with client.with_fallback(fallback_oai) as oai:
    response = oai.chat.completions.create(model="gpt-4o", messages=[...])
```

### Pattern 3 — Background polling

```python
from ailink import HealthPoller

with HealthPoller(client, interval=15) as poller:
    for user_message in incoming_messages():
        oai = client.openai() if poller.is_healthy else fallback
        response = oai.chat.completions.create(model="gpt-4o", messages=[...])
```

### Pattern 4 — Async

```python
from ailink import AsyncClient, AsyncHealthPoller

client   = AsyncClient(api_key="ailink_v1_...")
fallback = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

async with AsyncHealthPoller(client, interval=15) as poller:
    oai = client.openai() if poller.is_healthy else fallback
    response = await oai.chat.completions.create(model="gpt-4o", messages=[...])
```

---

## Passthrough Mode (Bring Your Own Key)

When a token has **no stored credential**, supply the upstream API key at call time:

```python
client = AIlinkClient(api_key="ailink_v1_...")

with client.with_upstream_key("sk-my-openai-key") as byok:
    resp = byok.post("/v1/chat/completions", json={
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Hello"}],
    })
```

---

## Session Tracing

Correlate multi-step agent workflows with a shared `session_id`:

```python
with client.trace(session_id="conv-abc123", properties={"env": "prod"}) as t:
    t.post("/v1/chat/completions", json={"messages": [...]})
    t.post("/v1/chat/completions", json={"messages": [...]})
```

---

## Per-Request Guardrails

```python
with client.with_guardrails(["pii_redaction", "prompt_injection"]) as g:
    response = g.openai().chat.completions.create(...)
```

---

## Circuit Breaker

```python
admin = AIlinkClient.admin(admin_key="ailink_admin_...")

token = admin.tokens.create(
    name="prod-gpt",
    upstream_url="https://api.openai.com/v1",
    credential_id="cred-uuid",
    circuit_breaker={"enabled": True, "failure_threshold": 5, "recovery_cooldown_secs": 60},
)

# Read/update at runtime
config = admin.tokens.get_circuit_breaker(token["token_id"])
admin.tokens.set_circuit_breaker(token["token_id"], enabled=True, failure_threshold=3)

# Check upstream health
health = admin.tokens.upstream_health()
```

---

## Configuration

```python
client = AIlinkClient(
    api_key="ailink_v1_...",
    gateway_url="https://gateway.ailink.dev",
    agent_name="my-agent",
    timeout=30,
    retries=3,
    verify_ssl=True,
)
```

---

## Config-as-Code

```python
admin = AIlinkClient.admin(admin_key="ailink_admin_...")

yaml_config = admin.config.export()
with open("ailink_config.yaml", "w") as f:
    f.write(yaml_config)

with open("ailink_config.yaml", "r") as f:
    admin.config.import_yaml(f.read())
```

---

## Service Registry

Register external APIs and proxy through them with a single token:

```python
admin.services.create(
    name="stripe",
    base_url="https://api.stripe.com",
    service_type="generic",
    credential_id="cred-uuid",
)

agent = AIlinkClient(api_key="ailink_v1_...", agent_name="billing-bot")
charges = agent.post("/v1/proxy/services/stripe/v1/charges", json={...})
```
