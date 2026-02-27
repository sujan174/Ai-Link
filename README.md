<p align="center">
  <h1 align="center">🔗 AIlink</h1>
  <p align="center"><strong>Secure API Gateway for AI Agents</strong></p>
  <p align="center"><em>"You manage the Intelligence. We manage the Access."</em></p>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> •
  <a href="docs/VISION.md">Vision</a> •
  <a href="docs/ARCHITECTURE.md">Architecture</a> •
  <a href="docs/SDK.md">SDK</a> •
  <a href="docs/API.md">API</a> •
  <a href="docs/SECURITY.md">Security</a> •
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## The Problem

Every AI agent needs API keys to do anything useful — Stripe, GitHub, AWS, Slack, OpenAI. Most developers store these in `.env` files or hardcoded variables, with no oversight over what the agent actually does with them.

### What Can Go Wrong

| Risk | What Happens |
|---|---|
| 🔓 **Prompt Injection** | Attackers trick agents into dumping `os.environ` |
| 💸 **Runaway Costs** | Agent loops burn through API budgets |
| 💥 **Accidental Damage** | Agent with broad permissions wipes production data |
| 🕵️ **No Visibility** | Nobody knows what the agent accessed or when |

## How AIlink Fixes This

AIlink sits between your agent and every external API. Instead of handing agents real keys (`sk_live_...`), you issue **virtual tokens** (`ailink_v1_...`). The gateway enforces your policies and injects the real key on the backend. The agent never sees it.

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    AI Agent      │──────▶│   AIlink Gateway │──────▶│   Stripe / AWS   │
│  (ailink_token)  │       │ (Policy + Inject)│       │    (real key)    │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

### What You Get

| Feature | Why It Matters |
|---|---|
| 🔐 **Key Isolation** | Real keys stay in the vault — agents can't leak what they don't have |
| 📋 **Policy Engine** | Control methods, paths, rates, and spend per agent. 100+ built-in patterns |
| 👤 **Human-in-the-Loop** | High-stakes operations pause for manual approval (Slack, dashboard) |
| 👻 **Shadow Mode** | Test policies by logging violations without blocking anything |
| 🔄 **Retry & Resilience** | Configurable retries with exponential backoff, jitter, and per-token circuit breakers |
| 🛡️ **Guardrails** | 100+ safety patterns, 22 presets, 5 vendor integrations (Azure, AWS, LlamaGuard, Palo Alto AIRS, Prompt Security) |
| 📊 **Audit Trail** | Every request logged — who, what, when, which policy fired, cost |
| 🔌 **Service Registry** | Register external APIs as named services — one token accesses multiple APIs |
| 🤖 **MCP Integration** | Register Model Context Protocol servers — tools auto-discovered and injected into LLM requests |
| 🏷️ **Model Aliases** | Decouple agents from specific models; swap upstream providers without changing agent code |
| 🎣 **Webhooks** | Real-time event notifications (policy violations, spend alerts, HITL requests) |
| 💲 **Spend Caps** | Per-token daily/monthly monetary limits, atomically enforced via Redis |
| 💲 **Pricing Overrides** | Custom per-model cost tracking with glob-pattern matching |
| 🔑 **SSO / OIDC** | Plug in Okta, Auth0, or Entra ID for enterprise auth with claim-to-role mapping |
| 👥 **Teams & RBAC** | Org hierarchy with teams, model access groups, and fine-grained API key scopes |
| 📈 **Anomaly Detection** | Sigma-based traffic anomaly alerts for unusual request spikes |
| 🤝 **Realtime API** | Transparent WebSocket proxy for OpenAI Realtime Voice/Audio sessions |
| ⚙️ **Config-as-Code** | Export and sync policies, tokens, and routing via YAML/JSON |
| ⚡ **Fast** | Rust gateway, tiered caching (in-memory + Redis), <1ms overhead on the hot path |

---

## Quickstart

### 1. Start AIlink

```bash
git clone https://github.com/sujan174/ailink.git
cd ailink
docker compose up -d
```

This brings up the full stack:
*   **Dashboard**: [http://localhost:3000](http://localhost:3000) (default key: `ailink-admin-test`)
*   **Gateway**: [http://localhost:8443](http://localhost:8443)

### 2. Configure via Dashboard
Open [http://localhost:3000](http://localhost:3000) and:
1. **Add a Credential**: Store your real provider keys (OpenAI, Anthropic, etc.) securely in the vault.
2. **Create Policies**: Define traffic routing, A/B splits, PII redaction, or cost limits.
3. **Generate a Token**: Issue an AILink virtual token that binds to your credential and policies.

### 3. Change 2 Lines of Code

Point your existing AI SDKs or agents to the AILink Gateway:

```python
import os
from ailink import AIlinkClient

# Use the virtual token you generated (reads AILINK_API_KEY from env by default)
os.environ["AILINK_API_KEY"] = "ailink_v1_..."
os.environ["AILINK_GATEWAY_URL"] = "http://localhost:8443"

client = AIlinkClient()
oai = client.openai()

# Business as usual — AILink handles the proxying, policies, and cost tracking!
response = oai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello AILink!"}]
)
```

📚 **For a complete step-by-step walkthrough, see the [Detailed Quickstart Guide](docs/QUICKSTART.md).**

---

## How It Works

```
Agent Request (ailink_token)
       │
       ▼
┌─────────────────────────────────────────────┐
│              AIlink Gateway                  │
│                                             │
│  1. Resolve token → credential + policies   │
│  2. Check cache (in-memory → Redis → PG)    │
│  3. Evaluate policies:                      │
│     • Method + Path allowed?                │
│     • Rate limit OK?                        │
│     • Spend cap OK?                         │
│     • Human approval needed?                │
│  4. Decrypt real API key from vault         │
│  5. Inject key → forward to upstream API    │
│  6. Scrub response (redact PII)             │
│  7. Log to audit trail                      │
└─────────────────────────────────────────────┘
       │
       ▼
Upstream API (real key, never exposed)
```

---

## Docs

| Document | What's In It |
|---|---|
| [Vision](docs/VISION.md) | Why this exists, target users, business model |
| [Architecture](docs/ARCHITECTURE.md) | System design, caching, vault, data flow |
| [Security](docs/SECURITY.md) | Threat model, encryption, key lifecycle |
| [SDK Guide](docs/SDK.md) | Python & TypeScript usage, LangChain/CrewAI integration |
| [API Reference](docs/API.md) | Management API endpoints |
| [Policy Guide](docs/POLICIES.md) | Authoring policies — conditions, actions, shadow mode |
| [Deployment](docs/DEPLOYMENT.md) | Docker Compose, Kubernetes, env vars |
| [Contributing](CONTRIBUTING.md) | Dev setup, PR process |

---

## Tech Stack

| Component | Technology |
|---|---|
| Gateway | **Rust** (Axum, Tower, Hyper, Tokio) |
| Data | **PostgreSQL 16** + **Redis 7** |
| Encryption | **AES-256-GCM** envelope encryption |
| SDK | **Python** (TypeScript planned) |
| Dashboard | **Next.js 16** (App Router, Tailwind CSS 4, ShadCN) |
| Observability | **OpenTelemetry** → Jaeger / Langfuse / DataDog |
| Deployment | **Docker Compose** / Kubernetes (Helm planned) |

---

## Project Layout

```
ailink/
├── gateway/                # Rust gateway (core)
│   ├── Cargo.toml
│   ├── Dockerfile
│   ├── migrations/         # SQL migrations (sqlx)
│   └── src/
│       ├── main.rs
│       ├── config.rs
│       ├── cache.rs
│       ├── cli.rs
│       ├── errors.rs
│       ├── rotation.rs
│       ├── mcp/            # MCP client, registry, types
│       ├── middleware/     # Policy engine, guardrails, redaction, audit, MCP proxy
│       ├── proxy/          # Upstream proxy, retry logic, model router
│       ├── vault/          # AES-256-GCM secret storage
│       ├── store/          # PostgreSQL data layer
│       ├── api/            # Management API handlers
│       └── models/         # Shared types
├── sdk/
│   └── python/             # Python SDK (pip install ailink)
├── dashboard/              # Next.js 16 admin UI
├── scripts/                # Integration test suites & CI checks
├── docs/                   # Documentation
├── docker-compose.yml
└── README.md
```

---

## License

[Apache 2.0](LICENSE)
