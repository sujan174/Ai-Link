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
| 📋 **Policy Engine** | Control methods, paths, rates, and spend per agent |
| 👤 **Human-in-the-Loop** | High-stakes operations pause for manual approval (Slack, dashboard) |
| 👻 **Shadow Mode** | Test policies by logging violations without blocking anything |
| 🔄 **Retry & Resilience** | Configurable retries with exponential backoff and jitter |
| 🛡️ **PII Scrubbing** | Auto-redact credit cards, SSNs, emails, API keys from responses |
| 📊 **Audit Trail** | Every request logged — who, what, when, which policy fired |
| 🔌 **Service Registry** | Register APIs as named services — one token accesses multiple APIs |
| ⚡ **Fast** | Rust gateway, tiered caching, <1ms overhead on the hot path |

---

## Quickstart

### 1. Start AIlink

```bash
git clone https://github.com/sujan174/ailink.git
cd ailink
docker compose up -d
```

This brings up the full stack:
*   **Dashboard**: [http://localhost:3000](http://localhost:3000) (default key: `ailink-admin-test` — [change it](docs/DEPLOYMENT.md))
*   **Gateway**: [http://localhost:8443](http://localhost:8443)

See the [Self-Hosting Guide](docs/self-hosting.md) for detailed setup.


### 2. Store a Real Key, Issue a Virtual Token

```bash
# Add your Stripe key to the vault
docker exec ailink-gateway ailink credential add \
  --name "stripe-production" \
  --key "sk_live_your_real_stripe_key"

# Create a scoped token for your agent
docker exec ailink-gateway ailink token create \
  --name "billing-agent-stripe" \
  --credential "stripe-production" \
  --upstream "https://api.stripe.com" \
  --methods GET,POST \
  --paths "/v1/charges/*,/v1/customers/*" \
  --rate-limit "60/min"
# → ailink_v1_proj_default_tok_abc123
```

### 3. Use It

```bash
pip install ailink
```

```python
import stripe
from ailink import AIlinkClient

# Point Stripe at the gateway instead of api.stripe.com
stripe.api_base = "http://localhost:8443"
stripe.api_key = "ailink_v1_proj_default_tok_abc123"

charges = stripe.Charge.list()  # proxied, policy-checked, logged
```

Your agent never touches the real Stripe key, can't go over 60 req/min, and can only hit `/v1/charges` and `/v1/customers`.

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
| Dashboard | **Next.js 14** |
| Observability | **OpenTelemetry** → Jaeger |
| Deployment | **Docker Compose** / Helm (planned) |

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
│       ├── middleware/     # Policy engine, redaction, audit
│       ├── proxy/          # Upstream proxy, retry logic
│       ├── vault/          # AES-256-GCM secret storage
│       ├── store/          # PostgreSQL data layer
│       └── models/         # Shared types
├── sdk/
│   └── python/             # Python SDK (pip install ailink)
├── dashboard/              # Next.js admin UI
├── examples/               # Demo scripts
├── docs/                   # Documentation
├── docker-compose.yml
└── README.md
```

---

## License

[Apache 2.0](LICENSE)
