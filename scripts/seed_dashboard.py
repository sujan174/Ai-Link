#!/usr/bin/env python3
"""
Comprehensive Dashboard Seed Script
====================================
Clears ALL old data, then populates every section of the AILink dashboard:
  - Credentials (OpenAI, Anthropic, Google)
  - Tokens (with upstream URLs, policies, spend caps)
  - Policies (rate-limit, PII-redact, cost-guard, shadow-mode)
  - Audit Logs (via proxy requests through httpbin mock upstream)
  - Sessions (multi-step agent traces)
  - Services
  - Webhooks
  - Model Pricing
  - API Keys

Usage:
    python3 scripts/seed_dashboard.py

Requires:
    pip install httpx
    The AILink gateway running at http://127.0.0.1:8443
    The mock-upstream (httpbin) running at http://localhost:8080
    AILINK_ENABLE_TEST_HOOKS=1 set on the gateway
"""

import os
import sys
import time
import uuid
import json
import random

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "python"))

import httpx

# ── Configuration ──────────────────────────────────────────
GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://127.0.0.1:8443")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "ailink-admin-test")
MOCK_UPSTREAM = os.getenv("MOCK_UPSTREAM_URL", "http://mock-upstream/anything")

HEADERS = {
    "Content-Type": "application/json",
    "X-Admin-Key": ADMIN_KEY,
}

client = httpx.Client(base_url=f"{GATEWAY_URL}/api/v1", headers=HEADERS, timeout=30)


def api(method, path, **kwargs):
    """Helper to call the gateway admin API."""
    resp = client.request(method, path, **kwargs)
    if resp.status_code >= 400:
        print(f"  ⚠ {method} {path} → {resp.status_code}: {resp.text[:200]}")
        return None
    if resp.status_code == 204:
        return {}
    try:
        return resp.json()
    except Exception:
        return {}


def clear_all():
    """Wipe all user-created data so we start fresh."""
    print("\n🗑️  Clearing existing data...")

    # Delete webhooks
    webhooks = api("GET", "/webhooks") or []
    for w in webhooks:
        api("DELETE", f"/webhooks/{w['id']}")
    print(f"   Deleted {len(webhooks)} webhooks")

    # Delete services
    services = api("GET", "/services") or []
    for s in services:
        api("DELETE", f"/services/{s['id']}")
    print(f"   Deleted {len(services)} services")

    # Revoke tokens (but don't delete, as audit logs reference them)
    tokens = api("GET", "/tokens") or []
    for t in tokens:
        api("DELETE", f"/tokens/{t['id']}")
    print(f"   Revoked {len(tokens)} tokens")

    # Delete policies
    policies = api("GET", "/policies") or []
    for p in policies:
        api("DELETE", f"/policies/{p['id']}")
    print(f"   Deleted {len(policies)} policies")

    # Delete API keys
    keys = api("GET", "/auth/keys") or []
    for k in keys:
        api("DELETE", f"/auth/keys/{k['id']}")
    print(f"   Deleted {len(keys)} API keys")

    # Delete pricing overrides
    pricing = api("GET", "/pricing") or []
    for p in pricing:
        api("DELETE", f"/pricing/{p['id']}")
    print(f"   Deleted {len(pricing)} pricing entries")

    print("   ✅ Cleared!")


def get_project_id():
    """Get the default project, or create one."""
    projects = api("GET", "/projects") or []
    if projects:
        return projects[0]["id"]
    proj = api("POST", "/projects", json={"name": "Demo Project"})
    return proj["id"]


def seed_credentials():
    """Create credentials for major providers."""
    print("\n🔑 Seeding credentials...")
    creds = {}
    providers = [
        ("openai-production", "openai", "sk-prod-openai-fake-key-1234567890"),
        ("anthropic-production", "anthropic", "sk-ant-prod-fake-key-1234567890"),
        ("google-gemini", "google", "AIzaSy-fake-gemini-key-1234567890"),
    ]
    for name, provider, secret in providers:
        result = api("POST", "/credentials", json={
            "name": name, "provider": provider, "secret": secret
        })
        if result:
            creds[provider] = result["id"]
            print(f"   ✅ {name} ({provider}) → {result['id'][:8]}...")
        else:
            # Fallback: list and pick
            existing = api("GET", "/credentials") or []
            for c in existing:
                if c["provider"] == provider:
                    creds[provider] = c["id"]
                    break
    return creds


def seed_policies(project_id):
    """Create a variety of policies."""
    print("\n🛡️  Seeding policies...")
    policies = []

    policy_defs = [
        {
            "name": "Rate Limit — 100 RPM",
            "mode": "enforce",
            "rules": [{
                "when": {"always": True},
                "then": {"action": "rate_limit", "window": "1m", "max_requests": 100, "key": "per_token"}
            }],
        },
        {
            "name": "PII Redaction",
            "mode": "enforce",
            "rules": [{
                "when": {"always": True},
                "then": {"action": "redact", "direction": "both", "patterns": ["email", "phone", "ssn"]}
            }],
        },
        {
            "name": "Cost Guard — $50/day",
            "mode": "enforce",
            "rules": [{
                "when": {"field": "usage.spend_today_usd", "op": "gt", "value": 50},
                "then": {"action": "deny", "message": "Daily spend cap of $50 exceeded"}
            }],
        },
        {
            "name": "Shadow Audit (log-only)",
            "mode": "shadow",
            "rules": [{
                "when": {"always": True},
                "then": {"action": "log", "level": "info"}
            }],
        },
    ]

    for pdef in policy_defs:
        pdef["project_id"] = project_id
        result = api("POST", "/policies", json=pdef)
        if result:
            policies.append(result["id"])
            print(f"   ✅ {pdef['name']} → {result['id'][:8]}...")
    return policies


def seed_tokens(project_id, creds, policy_ids):
    """Create tokens for different use cases."""
    print("\n🪙 Seeding tokens...")
    tokens = []

    token_defs = [
        {
            "name": "prod-gpt4-agent",
            "credential_id": creds.get("openai"),
            "upstream_url": MOCK_UPSTREAM,
            "project_id": project_id,
            "policy_ids": policy_ids[:2] if len(policy_ids) >= 2 else [],
            "log_level": 3,
        },
        {
            "name": "prod-claude-agent",
            "credential_id": creds.get("anthropic") or creds.get("openai"),
            "upstream_url": MOCK_UPSTREAM,
            "project_id": project_id,
            "policy_ids": policy_ids[2:3] if len(policy_ids) >= 3 else [],
            "log_level": 3,
        },
        {
            "name": "staging-fast-model",
            "credential_id": creds.get("openai"),
            "upstream_url": MOCK_UPSTREAM,
            "project_id": project_id,
            "policy_ids": [],
            "log_level": 2,
        },
        {
            "name": "dev-gemini-test",
            "credential_id": creds.get("google") or creds.get("openai"),
            "upstream_url": MOCK_UPSTREAM,
            "project_id": project_id,
            "policy_ids": policy_ids[3:4] if len(policy_ids) >= 4 else [],
            "log_level": 4,
        },
    ]

    for tdef in token_defs:
        if not tdef["credential_id"]:
            continue
        result = api("POST", "/tokens", json=tdef)
        if result:
            tokens.append({
                "id": result.get("token_id", ""),
                "name": tdef["name"],
            })
            print(f"   ✅ {tdef['name']} → {result.get('token_id', '')[:20]}...")
    return tokens


def seed_spend_caps(tokens):
    """Set spend caps on the first two tokens."""
    print("\n💰 Seeding spend caps...")
    if len(tokens) >= 1:
        api("PUT", f"/tokens/{tokens[0]['id']}/spend", json={"period": "daily", "limit_usd": 25.0})
        api("PUT", f"/tokens/{tokens[0]['id']}/spend", json={"period": "monthly", "limit_usd": 500.0})
        print(f"   ✅ {tokens[0]['name']}: $25/day, $500/month")
    if len(tokens) >= 2:
        api("PUT", f"/tokens/{tokens[1]['id']}/spend", json={"period": "daily", "limit_usd": 10.0})
        print(f"   ✅ {tokens[1]['name']}: $10/day")


def seed_webhooks(project_id):
    """Create sample webhooks."""
    print("\n🔔 Seeding webhooks...")
    webhooks = [
        {"url": "https://hooks.slack.com/services/T000/B000/fake-webhook", "events": ["policy.deny", "spend.exceeded"]},
        {"url": "https://discord.com/api/webhooks/000/fake-token", "events": ["approval.pending"]},
    ]
    for w in webhooks:
        result = api("POST", "/webhooks", json=w)
        if result:
            print(f"   ✅ {w['url'][:40]}...")


def seed_services(project_id):
    """Create sample services (action gateway)."""
    print("\n🔧 Seeding services...")
    services = [
        {
            "name": "Code Execution Sandbox",
            "description": "Isolated Docker sandbox for running agent-generated code",
            "base_url": "https://sandbox.internal.example.com",
            "service_type": "code_execution",
            "project_id": project_id,
        },
        {
            "name": "Vector Search (Pinecone)",
            "description": "RAG retrieval backend for document Q&A",
            "base_url": "https://my-index.svc.pinecone.io",
            "service_type": "vector_db",
            "project_id": project_id,
        },
    ]
    for s in services:
        result = api("POST", "/services", json=s)
        if result:
            print(f"   ✅ {s['name']}")


def seed_model_pricing():
    """Populate model pricing table."""
    print("\n💲 Seeding model pricing...")
    models = [
        ("openai", "gpt-4o", 2.50, 10.00),
        ("openai", "gpt-4-turbo", 10.00, 30.00),
        ("openai", "gpt-3.5-turbo", 0.50, 1.50),
        ("openai", "gpt-4o-mini", 0.15, 0.60),
        ("anthropic", "claude-3-opus", 15.00, 75.00),
        ("anthropic", "claude-3-sonnet", 3.00, 15.00),
        ("anthropic", "claude-3-haiku", 0.25, 1.25),
        ("anthropic", "claude-3.5-sonnet", 3.00, 15.00),
        ("google", "gemini-1.5-pro", 3.50, 10.50),
        ("google", "gemini-1.5-flash", 0.075, 0.30),
    ]
    for provider, model_pattern, input_price, output_price in models:
        result = api("PUT", "/pricing", json={
            "provider": provider,
            "model_pattern": model_pattern,
            "input_per_m": input_price,
            "output_per_m": output_price,
        })
        if result:
            print(f"   ✅ {provider}/{model_pattern}: ${input_price}/${output_price} per 1M tokens")


def seed_api_keys():
    """Create API keys with different roles."""
    print("\n🔐 Seeding API keys...")
    keys = [
        {"name": "CI/CD Pipeline", "role": "admin", "scopes": ["tokens:read", "tokens:write", "audit:read"]},
        {"name": "Dashboard Read-Only", "role": "viewer", "scopes": ["tokens:read", "audit:read", "analytics:read"]},
        {"name": "Billing Bot", "role": "billing", "scopes": ["billing:read", "analytics:read"]},
    ]
    for k in keys:
        result = api("POST", "/auth/keys", json=k)
        if result:
            print(f"   ✅ {k['name']} ({k['role']}) → {result.get('key', 'n/a')[:20]}...")


def seed_audit_logs(tokens, project_id):
    """Generate audit logs by sending real proxy requests through the gateway.

    Uses the gateway's test-hook headers to control cost/token/latency values
    and attribution headers (X-Session-Id, X-User-Id, X-Properties) to create
    realistic telemetry.  This exercises the full E2E path:
      token auth → policy evaluation → credential decryption → upstream → audit log.
    """
    if not tokens:
        print("\n⚠️  No tokens available, skipping audit log generation.")
        return

    print("\n📊 Seeding audit logs via real proxy requests...")

    MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-haiku", "claude-3.5-sonnet", "gpt-4o-mini"]
    AGENTS = ["DataExtractor", "CodeAssistant", "SupportBot", "ResearchAgent", "DevinClone"]
    USERS  = ["sujan", "alice", "bob", "carol"]
    ENVS   = ["production", "staging", "development"]
    TASKS  = ["code_review", "data_extraction", "customer_support", "research", "debugging"]
    PROMPTS = [
        "Summarize the quarterly report.",
        "Write a unit test for the login function.",
        "Explain the difference between TCP and UDP.",
        "Extract all email addresses from this document.",
        "Debug this stack trace and suggest a fix.",
        "Generate a marketing tagline for our product.",
        "Translate this paragraph into Spanish.",
        "Analyze the sentiment of these customer reviews.",
        "Create a SQL query to find the top 10 customers.",
        "What are the key takeaways from this research paper?",
    ]

    ok = 0
    fail = 0

    def proxy_request(token_id, *, model, prompt_tokens, completion_tokens, cost, agent_name,
                      session_id=None, user_id=None, properties=None):
        """Fire one proxy request through the gateway."""
        nonlocal ok, fail
        headers = {
            "Authorization": f"Bearer {token_id}",
            "Content-Type": "application/json",
            # Test hooks – gateway records these as if they came from the upstream
            "X-AILink-Test-Cost": str(cost),
            "X-AILink-Test-Tokens": f"{prompt_tokens},{completion_tokens}",
            "X-AIlink-Agent-Name": agent_name,
        }
        if session_id:
            headers["X-Session-Id"] = session_id
        if user_id:
            headers["X-User-Id"] = user_id
        if properties:
            headers["X-Properties"] = json.dumps(properties)

        body = {
            "model": model,
            "messages": [{"role": "user", "content": random.choice(PROMPTS)}],
        }

        try:
            r = httpx.post(f"{GATEWAY_URL}/v1/chat/completions", json=body, headers=headers, timeout=15)
            if r.status_code < 400:
                ok += 1
            else:
                fail += 1
                if fail <= 3:  # only show first few failures
                    print(f"     ⚠ {r.status_code}: {r.text[:120]}")
        except Exception as e:
            fail += 1
            if fail <= 3:
                print(f"     ⚠ Request error: {e}")

    # ── Scenario 1: 30 scattered single requests ──
    print("   📝 Single requests (30)...")
    for _ in range(30):
        tok = random.choice(tokens)
        model = random.choice(MODELS)
        user = random.choice(USERS)
        env = random.choice(ENVS)
        proxy_request(
            tok["id"],
            model=model,
            prompt_tokens=random.randint(50, 3000),
            completion_tokens=random.randint(20, 800),
            cost=round(random.uniform(0.001, 0.10), 6),
            agent_name=f"{user}-agent",
            user_id=user,
            properties={"env": env, "request_type": "single"},
        )
    print(f"   ✅ 30 single requests done  (ok={ok} fail={fail})")

    # ── Scenario 2: 5 multi-step agent sessions ──
    print("   🤖 Agent sessions...")
    for agent_name in AGENTS:
        session_id = f"{agent_name.lower()}-{uuid.uuid4().hex[:8]}"
        tok = random.choice(tokens)
        steps = random.randint(3, 8)
        task = random.choice(TASKS)
        user = random.choice(USERS)
        env = random.choice(ENVS)
        for step in range(steps):
            proxy_request(
                tok["id"],
                model=random.choice(MODELS[:4]),
                prompt_tokens=random.randint(200, 8000),
                completion_tokens=random.randint(50, 2000),
                cost=round(random.uniform(0.001, 0.15), 6),
                agent_name=agent_name,
                session_id=session_id,
                user_id=user,
                properties={"agent_name": agent_name, "env": env, "task": task},
            )
        print(f"   ✅ Session '{session_id}' — {steps} steps")

    # ── Scenario 3: 5 high-latency requests ──
    print("   🐢 High-latency requests...")
    for _ in range(5):
        tok = random.choice(tokens)
        proxy_request(
            tok["id"],
            model="gpt-4-turbo",
            prompt_tokens=random.randint(5000, 15000),
            completion_tokens=random.randint(2000, 5000),
            cost=round(random.uniform(0.10, 0.50), 6),
            agent_name="heavy-analysis-bot",
            properties={"type": "heavy_analysis", "env": "staging"},
        )
    print(f"   ✅ 5 high-latency requests done")

    # ── Scenario 4: 10 fast requests ──
    print("   ⚡ Fast requests...")
    for _ in range(10):
        tok = random.choice(tokens)
        proxy_request(
            tok["id"],
            model="gpt-4o-mini",
            prompt_tokens=random.randint(20, 200),
            completion_tokens=random.randint(5, 100),
            cost=round(random.uniform(0.0001, 0.005), 6),
            agent_name="quick-lookup-bot",
            properties={"type": "fast_query", "env": "production"},
        )
    print(f"   ✅ 10 fast requests done")

    total = ok + fail
    print(f"\n   📊 Total {total} proxy requests fired  (✅ {ok} ok, ❌ {fail} failed)")
    if fail > 0:
        print(f"   ℹ️  Some failures are expected — they'll show as errors in the dashboard")


def main():
    print("=" * 60)
    print("  AILink Dashboard — Comprehensive Seed Script")
    print("=" * 60)
    print(f"  Gateway: {GATEWAY_URL}")
    print(f"  Mock Upstream: {MOCK_UPSTREAM}")

    # 0. Verify gateway is reachable
    try:
        resp = httpx.get(f"{GATEWAY_URL}/healthz", timeout=5)
        print(f"  Health: {resp.status_code}")
    except Exception as e:
        print(f"\n❌ Cannot reach gateway at {GATEWAY_URL}: {e}")
        print("   Make sure the gateway is running!")
        sys.exit(1)

    # 1. Clear
    clear_all()

    # 2. Get project
    project_id = get_project_id()
    print(f"\n📁 Using project: {project_id}")

    # 3. Seed everything
    creds = seed_credentials()
    policy_ids = seed_policies(project_id)
    tokens = seed_tokens(project_id, creds, policy_ids)
    seed_spend_caps(tokens)
    seed_webhooks(project_id)
    seed_services(project_id)
    seed_model_pricing()
    seed_api_keys()
    seed_audit_logs(tokens, project_id)

    print("\n" + "=" * 60)
    print("  ✅ Dashboard fully seeded!")
    print("  Open http://localhost:3000 to explore.")
    print("=" * 60)


if __name__ == "__main__":
    main()
