# AIlink Python SDK

Official Python client for the [AIlink Gateway](https://github.com/ailink/ailink) — secure credential management and policy enforcement for AI agents.

## Installation

```bash
pip install ailink
```

With provider extras:

```bash
pip install ailink[openai]      # OpenAI compatibility
pip install ailink[anthropic]   # Anthropic compatibility
```

## Quick Start

### Agent / Proxy Usage

Route LLM requests through the gateway with automatic credential injection:

```python
from ailink import AIlinkClient

# Create a client with your virtual token
client = AIlinkClient(api_key="ailink_v1_...")

# Use OpenAI's SDK — requests route through the gateway automatically
oai = client.openai()
response = oai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

### Admin / Management Usage

Manage tokens, credentials, policies, and view audit logs:

```python
from ailink import AIlinkClient

admin = AIlinkClient.admin(admin_key="your-admin-key")

# Credential lifecycle
cred = admin.credentials.create(name="prod-openai", provider="openai", secret="sk-...")
creds = admin.credentials.list()  # → List[Credential]

# Token lifecycle
token = admin.tokens.create(
    name="billing-bot",
    credential_id=cred["id"],
    upstream_url="https://api.openai.com",
)
api_key = token["token_id"]  # → "ailink_v1_..."

tokens = admin.tokens.list()           # → List[Token]
admin.tokens.revoke(api_key)           # Soft-delete

# Policy lifecycle
policy = admin.policies.create(
    name="rate-limit-100",
    mode="enforce",
    rules=[{"type": "rate_limit", "window": "1m", "max_requests": 100}],
)
admin.policies.update(policy["id"], mode="shadow")
admin.policies.delete(policy["id"])

# Audit logs
logs = admin.audit.list(limit=50)      # → List[AuditLog]

# HITL approvals
pending = admin.approvals.list()       # → List[ApprovalRequest]
admin.approvals.approve(pending[0].id)
admin.approvals.reject(pending[1].id)
```

### Async Usage

```python
from ailink import AsyncClient

async with AsyncClient(api_key="ailink_v1_...") as client:
    oai = client.openai()
    tokens = await client.tokens.list()
```

## Error Handling

The SDK raises specific exceptions for different error types:

```python
from ailink import AIlinkClient
from ailink.exceptions import (
    AuthenticationError,  # 401 — invalid API key
    NotFoundError,        # 404 — resource doesn't exist
    RateLimitError,       # 429 — rate limit exceeded
    ValidationError,      # 422 — bad request payload
    GatewayError,         # 5xx — gateway error
    AIlinkError,          # Base class for all errors
)

admin = AIlinkClient.admin(admin_key="...")

try:
    admin.tokens.revoke("nonexistent")
except NotFoundError as e:
    print(f"Token not found: {e.message}")
    print(f"Status: {e.status_code}")
except AIlinkError as e:
    print(f"Unexpected error: {e}")
```

## Models

All list methods return typed Pydantic models with attribute access:

| Model | Fields |
| :--- | :--- |
| `Token` | `id`, `name`, `credential_id`, `upstream_url`, `is_active`, `policy_ids`, `scopes` |
| `Credential` | `id`, `name`, `provider`, `created_at` |
| `Policy` | `id`, `name`, `mode`, `rules` |
| `AuditLog` | `id`, `method`, `path`, `upstream_status`, `response_latency_ms`, `agent_name`, ... |
| `ApprovalRequest` | `id`, `token_id`, `status`, `request_summary`, `expires_at` |
| `ApprovalDecision` | `id`, `status`, `updated` |

## License

MIT
