# AILink — Competitive Gap & Engineering Roadmap

> All 16 gaps vs. Portkey and LiteLLM, ranked by impact. Effort = estimated time with Claude as pair programmer.  
> Last updated: Feb 2026

---

## 🟢 Our Unique Advantages (Competitors Don't Have These)

| Feature | Why It Matters |
|---|---|
| **Human-in-the-Loop (HITL)** | Approval gates for autonomous agents. Neither competitor has this. |
| **Shadow Mode** | Test policies without blocking traffic. |
| **OIDC/JWT Auth** | Native JWKS validation. Competitors use API keys only. |
| **Rust Performance** | Sub-ms proxy overhead vs. Python (LiteLLM) / Node.js (Portkey). |
| **Deep Policy Engine** | 15+ action types, nested AND/OR, async eval, time-based rules. |
| **Webhook Policy Actions** | Fire webhooks *as a policy action*, not just budget alerts. |

---

## Priority Tier 1 — Ship Before Launch *(~6.5 days total)*

| # | Gap | Missing/Inferior | Why Critical | Effort |
|---|---|---|---|---|
| **1** | **Provider Breadth** — Azure OpenAI, Bedrock, Groq, Mistral, Together, Cohere, Ollama | 🔴 Missing | Enterprise will reject us in the first 5 min if their stack isn't supported. | ~2 days |
| **2** | **~~SDK Framework Integrations~~** — LangChain, CrewAI, LlamaIndex ✅ | 🟠 Inferior | ~~Devs Google "ailink langchain". No result = they pick LiteLLM.~~ **DONE** | ~~1 day~~ |
| **3** | **~~Spend Tracking Granularity~~** — per-model, per-token, per-tag ✅ | 🟠 Inferior | ~~"Show me GPT-4o spend by team this month" — can't answer this today.~~ **DONE** | ~~2 days~~ |
| **4** | **Node.js / TypeScript SDK** | 🟠 Inferior | ~50% of AI devs use TypeScript. No TS SDK = invisible to half the market. | ~1.5 days |

---

## Priority Tier 2 — Ship Within 2 Weeks *(~6.5 days total)*

| # | Gap | Missing/Inferior | Why Critical | Effort |
|---|---|---|---|---|
| **5** | **~~Observability Export~~** — Prometheus `/metrics`, Langfuse, DataDog ✅ | 🟠 Inferior | ~~SREs can't plug us into Grafana/DataDog without custom work.~~ **DONE** | ~~1 day~~ |
| **6** | **~~Weighted Load Balancing~~** — latency-based, cost-based, least-busy ✅ | 🔴 Missing | ~~LiteLLM has 5 routing strategies. We only have A/B split.~~ **DONE — 5 strategies** | ~~1.5 days~~ |
| **7** | **~~RBAC Depth~~** — model-level access groups per API key ✅ | 🟠 Inferior | ~~"This key can only use GPT-4o-mini, not GPT-4o." Can't do that today.~~ **DONE** | ~~0.5 day~~ |
| **8** | **SSO** — Okta, Google for dashboard login | 🔴 Missing | Enterprise procurement checklist item. No SSO = not enterprise-ready. | ~2 days |
| **9** | **~~Team/Org Management~~** — multi-team hierarchy, tag attribution ✅ | 🔴 Missing | ~~Teams are the basic unit of enterprise org structure. Needed for #3 too.~~ **DONE** | ~~1.5 days~~ |

---

## Priority Tier 3 — Ship Within Month 1 *(~10.5 days total)*

| # | Gap | Missing/Inferior | Why Critical | Effort |
|---|---|---|---|---|
| **10** | ~~**Guardrails Breadth** — 60+ built-in rules, Palo Alto AIRS, Prompt Security~~ | ✅ Done | Expanded to 100+ patterns, 22 presets, 5 vendors (Azure, AWS, LlamaGuard, Palo Alto AIRS, Prompt Security). 862 tests pass. | ✅ |
| **11** | **KMS Integration** — HashiCorp Vault, AWS KMS | 🟠 Inferior | "Can I use my existing KMS?" is a standard enterprise security question. | ~1.5 days |
| **12** | ~~**MCP Server Integration**~~ | ✅ Done | MCP client (Streamable HTTP), registry, 6 API endpoints, proxy tool injection, dashboard UI. 25 tests pass. | ✅ |
| **13** | **Dashboard Polish & UX** — onboarding, empty states, animations | 🟠 Inferior | Portkey's UI is a selling point. Buyer demos are won on UX. | ~3-5 days |

---

## Priority Tier 4 — Ship Within Quarter 1 *(~5 days + $ total)*

| # | Gap | Missing/Inferior | Why Critical | Effort |
|---|---|---|---|---|
| **14** | **Prompt Management** — versioning, playground, A/B testing | 🔴 Missing | Portkey's prompt playground is a user magnet. Major surface area. | ~4 days |
| **15** | **Cache Streaming** — stream cached responses chunk-by-chunk | 🟠 Inferior | Portkey streams cached responses so UX is identical to live. We return full blob. | ~0.5 day |
| **16** | **Compliance Certifications** — SOC-2 Type II, ISO 27001 | 🔴 Missing | LiteLLM already has both. Enterprise procurement requires SOC-2. | Process, ~$15-30K, 3-6 months |

---

## Summary

| Tier | Total Effort | Impact |
|---|---|---|
| Tier 1 | **~6.5 days** | Unblocks 90% of enterprise evaluations |
| Tier 2 | **~6.5 days** | Full competitive parity with Portkey/LiteLLM |
| Tier 3 | **~10.5 days** | Differentiation + forward positioning |
| Tier 4 | **~5 days + $** | Market leadership |

**Total to full competitive parity: ~29 days of focused pair programming.**
