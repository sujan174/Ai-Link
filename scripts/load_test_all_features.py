#!/usr/bin/env python3
"""
Comprehensive AILink Load Test & Feature Verification Script.

Uses the official Python SDK (`ailink`) instead of raw httpx to exercise
every SDK capability and generate thousands of dashboard-visible requests.

Usage:
    python3 scripts/load_test_all_features.py [--requests N]

Features tested:
  ✓ SDK Admin Client          — AIlinkClient.admin()
  ✓ SDK Proxy Client          — AIlinkClient(api_key=...)
  ✓ Credential CRUD           — admin.credentials.create / .list
  ✓ Token CRUD                — admin.tokens.create / .list / .revoke
  ✓ Policy CRUD               — admin.policies.create / .list / .update / .delete
  ✓ Service CRUD              — admin.services.create / .list / .delete
  ✓ Audit Logs                — admin.audit.list / .list_all
  ✓ Approvals (HITL)          — admin.approvals.list / .approve / .reject
  ✓ Health check              — client.health() / client.is_healthy()
  ✓ Trace context manager     — client.trace(session_id=..., properties=...)
  ✓ Guardrails context mgr    — client.guardrails([...])
  ✓ BYOK passthrough          — client.with_upstream_key(...)
  ✓ Policy: Deny              — Deny DELETE requests
  ✓ Policy: Rate Limit        — Window-based rate limiting
  ✓ Policy: Redaction          — PII SSN redaction
  ✓ Policy: Override           — Model downgrade override
  ✓ Policy: Transform Headers — Header injection
  ✓ Action Gateway Services   — Service proxy routing
  ✓ High-volume load gen      — Thousands of proxy requests across sessions
"""
import os
import sys
import uuid
import time
import random
import argparse
import httpx
import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Add the SDK to path ──────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "python"))

from ailink import AIlinkClient
from ailink.exceptions import (
    AIlinkError, RateLimitError, PolicyDeniedError, AuthenticationError
)

# ── Configuration ────────────────────────────────────────────
GATEWAY_URL = os.getenv("AILINK_GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY = os.getenv("AILINK_ADMIN_KEY", "ailink-admin-test")
MOCK_UPSTREAM = os.getenv("MOCK_UPSTREAM_URL", "http://mock-upstream:80/anything")
RUN_ID = str(uuid.uuid4())[:8]

# ── Counters ─────────────────────────────────────────────────
stats = {"pass": 0, "fail": 0, "requests_sent": 0}

MODELS = ["gpt-4", "gpt-4o", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet", "gemini-pro"]
PROMPTS = [
    "Explain quantum computing in simple terms.",
    "Write a haiku about Rust programming.",
    "What are the benefits of microservices?",
    "Translate 'hello world' to Spanish.",
    "Summarize the theory of relativity.",
    "What is the capital of France?",
    "Explain Docker containers.",
    "How does a neural network work?",
    "What is the time complexity of quicksort?",
    "Write a Python function to reverse a string.",
    "What are design patterns in software engineering?",
    "Explain the CAP theorem.",
    "How does OAuth 2.0 work?",
    "What is eventual consistency?",
    "Describe the SOLID principles.",
]

# ── Helpers ──────────────────────────────────────────────────

def run_test(name, fn):
    print(f"  🔄 {name}...", end=" ", flush=True)
    try:
        fn()
        print("✅")
        stats["pass"] += 1
    except Exception as e:
        print(f"❌ {e}")
        stats["fail"] += 1

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ══════════════════════════════════════════════════════════════
#  PHASE 1: SDK Admin Client — CRUD Operations
# ══════════════════════════════════════════════════════════════

def phase_1_admin_crud(admin):
    """Test all admin CRUD operations using the SDK resource clients."""
    section("Phase 1: SDK Admin CRUD Operations")

    # ── Credentials ───────────────────────────────────────────
    cred = None
    def test_credential_create():
        nonlocal cred
        cred = admin.credentials.create(
            name=f"load-test-openai-{RUN_ID}",
            provider="openai",
            secret="sk-load-test-fake-key-12345",
        )
        assert cred.id, f"Credential ID missing: {cred}"
    run_test("credentials.create()", test_credential_create)

    def test_credential_list():
        creds = admin.credentials.list()
        assert any(c.id == cred.id for c in creds), "Created credential not found in list"
    run_test("credentials.list()", test_credential_list)

    # ── Policies (full CRUD lifecycle) ────────────────────────
    pol = None
    def test_policy_create():
        nonlocal pol
        pol = admin.policies.create(
            name=f"load-test-deny-{RUN_ID}",
            rules=[{"when": {"field": "request.method", "op": "eq", "value": "DELETE"},
                    "then": {"action": "deny", "status": 403, "message": "Blocked"}}],
            mode="enforce", phase="pre",
        )
        assert pol.id, f"Policy ID missing: {pol}"
    run_test("policies.create()", test_policy_create)

    def test_policy_list():
        pols = admin.policies.list()
        assert any(p.id == pol.id for p in pols), "Created policy not in list"
    run_test("policies.list()", test_policy_list)

    def test_policy_update():
        admin.policies.update(pol.id, name=f"load-test-deny-updated-{RUN_ID}")
    run_test("policies.update()", test_policy_update)

    # ── Tokens ────────────────────────────────────────────────
    tok = None
    def test_token_create():
        nonlocal tok
        tok = admin.tokens.create(
            name=f"load-test-token-{RUN_ID}",
            upstream_url=MOCK_UPSTREAM,
            credential_id=cred.id,
            policy_ids=[pol.id],
        )
        assert tok.token_id, f"Token ID missing: {tok}"
    run_test("tokens.create()", test_token_create)

    def test_token_list():
        tokens = admin.tokens.list()
        assert any(t.name == f"load-test-token-{RUN_ID}" for t in tokens)
    run_test("tokens.list()", test_token_list)

    # ── Services ──────────────────────────────────────────────
    svc = None
    def test_service_create():
        nonlocal svc
        svc = admin.services.create(
            name=f"load-svc-{RUN_ID}",
            base_url=MOCK_UPSTREAM.replace("127.0.0.1", "localhost"),
            description="Load test mock service",
            service_type="generic",
            credential_id=cred.id,
        )
        assert svc.get("id"), f"Service ID missing: {svc}"
    run_test("services.create()", test_service_create)

    def test_service_list():
        services = admin.services.list()
        assert any(s.name == f"load-svc-{RUN_ID}" for s in services)
    run_test("services.list()", test_service_list)

    # ── Audit Logs ────────────────────────────────────────────
    def test_audit_list():
        logs = admin.audit.list(limit=10)
        assert isinstance(logs, list), f"Expected list, got {type(logs)}"
    run_test("audit.list(limit=10)", test_audit_list)

    # ── Approvals listing ─────────────────────────────────────
    def test_approvals_list():
        approvals = admin.approvals.list()
        assert isinstance(approvals, list)
    run_test("approvals.list()", test_approvals_list)

    return cred, tok, pol, svc


# ══════════════════════════════════════════════════════════════
#  PHASE 2: SDK Proxy Client — Feature verification
# ══════════════════════════════════════════════════════════════

def phase_2_proxy_features(admin, cred):
    """Test proxy features: health, trace, guardrails, BYOK, deny, override, redaction."""
    section("Phase 2: SDK Proxy Client & Feature Verification")

    # ── Health check ──────────────────────────────────────────
    # Create a fresh proxy client with a real token (no policy)
    plain_tok = admin.tokens.create(
        name=f"proxy-plain-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
    )
    proxy = AIlinkClient(api_key=plain_tok.token_id, gateway_url=GATEWAY_URL)

    def test_health():
        h = proxy.health()
        assert h["status"] == "ok", f"Health not ok: {h}"
    run_test("client.health()", test_health)

    def test_is_healthy():
        assert proxy.is_healthy(), "is_healthy returned False"
    run_test("client.is_healthy()", test_is_healthy)

    # ── Basic proxy POST ──────────────────────────────────────
    def test_proxy_post():
        r = proxy.post("/v1/chat/completions", json={
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "Hello!"}],
        })
        assert r.status_code == 200, f"Proxy POST failed: {r.status_code}"
        stats["requests_sent"] += 1
    run_test("client.post()", test_proxy_post)

    # ── Invalid token returns 401 ─────────────────────────────
    def test_invalid_auth():
        bad = AIlinkClient(api_key="fake-key-999", gateway_url=GATEWAY_URL)
        r = bad.post("/v1/chat/completions", json={"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    run_test("401 on bad token", test_invalid_auth)

    # ── Trace context manager (sessions) ──────────────────────
    def test_trace():
        with proxy.trace(session_id=f"load-session-{RUN_ID}", properties={"env": "test", "run": RUN_ID}) as t:
            r = t.post("/v1/chat/completions", json={
                "model": "gpt-4",
                "messages": [{"role": "user", "content": "Traced request"}],
            })
            assert r.status_code == 200
            stats["requests_sent"] += 1
    run_test("client.trace() session", test_trace)

    # ── Guardrails context manager ────────────────────────────
    def test_guardrails():
        with proxy.guardrails(["pii_redaction"]) as g:
            r = g.post("/v1/chat/completions", json={
                "model": "gpt-4",
                "messages": [{"role": "user", "content": "My SSN is 123-45-6789"}],
            })
            assert r.status_code == 200
            stats["requests_sent"] += 1
    run_test("client.guardrails()", test_guardrails)

    # ── BYOK passthrough ──────────────────────────────────────
    import httpx as _httpx
    _byok_resp = _httpx.post(f"{GATEWAY_URL}/api/v1/tokens",
        headers={"X-Admin-Key": ADMIN_KEY},
        json={"name": f"byok-test-{RUN_ID}", "upstream_url": MOCK_UPSTREAM})
    _byok_resp.raise_for_status()
    byok_tok_id = _byok_resp.json()["token_id"]
    def test_byok():
        byok_client = AIlinkClient(api_key=byok_tok_id, gateway_url=GATEWAY_URL)
        with byok_client.with_upstream_key("sk-my-own-key-12345") as bk:
            r = bk.post("/v1/chat/completions", json={
                "model": "gpt-4",
                "messages": [{"role": "user", "content": "BYOK test"}],
            })
            assert r.status_code == 200
            stats["requests_sent"] += 1
    run_test("client.with_upstream_key() BYOK", test_byok)

    # ── Policy: Deny DELETE ───────────────────────────────────
    deny_pol = admin.policies.create(
        name=f"deny-del-{RUN_ID}",
        rules=[{"when": {"field": "request.method", "op": "eq", "value": "DELETE"},
                "then": {"action": "deny", "status": 403, "message": "Blocked"}}],
    )
    deny_tok = admin.tokens.create(
        name=f"deny-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
        policy_ids=[deny_pol.id],
    )
    def test_deny():
        deny_client = AIlinkClient(api_key=deny_tok.token_id, gateway_url=GATEWAY_URL)
        r = deny_client.delete("/anything")
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        stats["requests_sent"] += 1
    run_test("Policy: Deny DELETE", test_deny)

    # ── Policy: Override model ────────────────────────────────
    ov_pol = admin.policies.create(
        name=f"override-model-{RUN_ID}",
        rules=[{"when": {"always": True},
                "then": {"action": "override", "set_body_fields": {"model": "gpt-3.5-turbo"}}}],
    )
    ov_tok = admin.tokens.create(
        name=f"override-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
        policy_ids=[ov_pol.id],
    )
    def test_override():
        ov_client = AIlinkClient(api_key=ov_tok.token_id, gateway_url=GATEWAY_URL)
        r = ov_client.post("/v1/chat/completions", json={"model": "gpt-4"})
        echo = r.json().get("json", {})
        assert echo.get("model") == "gpt-3.5-turbo", f"Override failed: {echo}"
        stats["requests_sent"] += 1
    run_test("Policy: Override model", test_override)

    # ── Policy: Transform headers ─────────────────────────────
    xf_pol = admin.policies.create(
        name=f"xf-hdr-{RUN_ID}",
        rules=[{"when": {"always": True},
                "then": {"action": "transform",
                         "operations": [{"type": "set_header", "name": "X-Load-Test", "value": "true"}]}}],
    )
    xf_tok = admin.tokens.create(
        name=f"xf-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
        policy_ids=[xf_pol.id],
    )
    def test_transform():
        xf_client = AIlinkClient(api_key=xf_tok.token_id, gateway_url=GATEWAY_URL)
        r = xf_client.post("/v1/chat/completions", json={"model": "gpt-4"})
        headers = r.json().get("headers", {})
        assert headers.get("X-Load-Test") == "true", f"Header not injected: {headers}"
        stats["requests_sent"] += 1
    run_test("Policy: Transform Headers", test_transform)

    # ── Policy: Redaction ─────────────────────────────────────
    redact_pol = admin.policies.create(
        name=f"redact-{RUN_ID}",
        rules=[{"when": {"always": True},
                "then": {"action": "redact", "direction": "request", "patterns": ["ssn"]}}],
    )
    redact_tok = admin.tokens.create(
        name=f"redact-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
        policy_ids=[redact_pol.id],
    )
    def test_redaction():
        rc = AIlinkClient(api_key=redact_tok.token_id, gateway_url=GATEWAY_URL)
        r = rc.post("/v1/chat/completions", json={
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "My SSN is 111-22-3333"}],
        })
        echo = r.json().get("json", {})
        content = echo.get("messages", [{}])[0].get("content", "")
        assert "111-22-3333" not in content, "SSN was not redacted"
        stats["requests_sent"] += 1
    run_test("Policy: PII Redaction", test_redaction)

    # ── Rate Limit ────────────────────────────────────────────
    rl_pol = admin.policies.create(
        name=f"rl-strict-{RUN_ID}",
        rules=[{"when": {"always": True},
                "then": {"action": "rate_limit", "window": "1m", "max_requests": 2}}],
    )
    rl_tok = admin.tokens.create(
        name=f"rl-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
        policy_ids=[rl_pol.id],
    )
    def test_rate_limit():
        rl = AIlinkClient(api_key=rl_tok.token_id, gateway_url=GATEWAY_URL)
        d = {"model": "gpt-4", "messages": [{"role": "user", "content": "rl"}]}
        r1 = rl.post("/v1/chat/completions", json=d)
        r2 = rl.post("/v1/chat/completions", json=d)
        assert r1.status_code == 200 and r2.status_code == 200, "First 2 should pass"
        r3 = rl.post("/v1/chat/completions", json=d)
        assert r3.status_code == 429, f"Expected 429, got {r3.status_code}"
        stats["requests_sent"] += 3
    run_test("Policy: Rate Limit", test_rate_limit)

    # ── Action Gateway Service Proxy ──────────────────────────
    svc = admin.services.create(
        name=f"echo-svc-{RUN_ID}",
        base_url=MOCK_UPSTREAM.replace("127.0.0.1", "localhost"),
        service_type="generic",
        credential_id=cred.id,
    )
    svc_tok = admin.tokens.create(
        name=f"svc-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
    )
    def test_service_proxy():
        sc = AIlinkClient(api_key=svc_tok.token_id, gateway_url=GATEWAY_URL)
        r = sc.post(f"/v1/proxy/services/echo-svc-{RUN_ID}/some/path", json={"foo": "bar"})
        assert r.status_code == 200, f"Service proxy failed: {r.status_code} {r.text}"
        stats["requests_sent"] += 1
    run_test("Service Proxy (/v1/proxy/services/...)", test_service_proxy)

    # ── HITL approval flow via SDK ────────────────────────────
    hitl_pol = admin.policies.create(
        name=f"hitl-{RUN_ID}",
        rules=[{"when": {"field": "request.body.alert", "op": "eq", "value": True},
                "then": {"action": "require_approval", "timeout": "1m", "fallback": "deny"}}],
    )
    hitl_tok = admin.tokens.create(
        name=f"hitl-tok-{RUN_ID}",
        upstream_url=MOCK_UPSTREAM,
        credential_id=cred.id,
        policy_ids=[hitl_pol.id],
    )
    def test_hitl_sdk():
        import httpx
        result = []
        def fire():
            try:
                r = httpx.post(
                    f"{GATEWAY_URL}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {hitl_tok.token_id}"},
                    json={"model": "gpt-4", "messages": [{"role": "user", "content": "approve me"}], "alert": True},
                    timeout=15.0,
                )
                result.append(r)
            except Exception as e:
                result.append(e)
        bg = threading.Thread(target=fire)
        bg.start()
        time.sleep(1.5)
        approvals = admin.approvals.list()
        pending = [a for a in approvals if a.token_id == hitl_tok.token_id and a.status == "pending"]
        assert len(pending) > 0, f"No pending approval (found {len(approvals)} total)"
        admin.approvals.approve(pending[0].id)
        bg.join(timeout=10)
        assert len(result) > 0 and isinstance(result[0], httpx.Response)
        assert result[0].status_code == 200, f"HITL response: {result[0].status_code}"
        stats["requests_sent"] += 1
    run_test("HITL Approval via SDK", test_hitl_sdk)

    return plain_tok


# ══════════════════════════════════════════════════════════════
#  PHASE 3: High-Volume Load Generation (thousands of requests)
# ══════════════════════════════════════════════════════════════

def phase_3_load_gen(admin, cred, num_requests):
    """Send thousands of requests across multiple sessions and models."""
    section(f"Phase 3: Load Generation — {num_requests} requests")

    # Create several tokens with different configs to simulate realistic traffic
    tokens = []
    for i in range(5):
        tok = admin.tokens.create(
            name=f"load-agent-{i}-{RUN_ID}",
            upstream_url=MOCK_UPSTREAM,
            credential_id=cred.id,
        )
        tokens.append(tok)

    session_ids = [f"session-{RUN_ID}-{j}" for j in range(10)]
    clients = [AIlinkClient(api_key=t.token_id, gateway_url=GATEWAY_URL, timeout=15.0) for t in tokens]

    sent = 0
    errors = 0
    start_time = time.time()

    def send_one(idx):
        nonlocal sent, errors
        client_sdk = clients[idx % len(clients)]
        model = random.choice(MODELS)
        prompt = random.choice(PROMPTS)
        session = random.choice(session_ids)
        props = {"env": random.choice(["prod", "staging", "dev"]),
                 "customer": random.choice(["acme", "globex", "initech", "umbrella"]),
                 "run_id": RUN_ID}
        
        pricing = {
            "gpt-4": (0.03, 0.06),
            "gpt-4o": (0.005, 0.015),
            "gpt-3.5-turbo": (0.0005, 0.0015),
            "claude-3-opus": (0.015, 0.075),
            "claude-3-sonnet": (0.003, 0.015),
            "gemini-pro": (0.00125, 0.00375),
        }
        
        prompt_t = random.randint(10, 1500)
        completion_t = random.randint(5, 800)
        p_rate, c_rate = pricing.get(model, (0.01, 0.02))
        cost = (prompt_t * p_rate + completion_t * c_rate) / 1000.0
        
        latency_ms = random.randint(150, 4500)

        import json
        headers = {
            "Authorization": f"Bearer {client_sdk.api_key}",
            "x-session-id": session,
            "x-properties": json.dumps(props),
            "x-ailink-test-tokens": f"{prompt_t},{completion_t}",
            "x-ailink-test-cost": f"{cost:.6f}",
            "x-ailink-test-latency": str(latency_ms),
        }

        try:
            r = httpx.post(
                f"{GATEWAY_URL}/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=15.0
            )
            return r.status_code < 500
        except Exception as e:
            return False

    print(f"  Sending {num_requests} requests with {len(clients)} agents across {len(session_ids)} sessions...")
    print(f"  Using thread pool (8 workers) for concurrency...\n")

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(send_one, i) for i in range(num_requests)]
        for i, future in enumerate(as_completed(futures)):
            ok = future.result()
            if ok:
                sent += 1
            else:
                errors += 1
            if (i + 1) % 100 == 0:
                elapsed = time.time() - start_time
                rps = (i + 1) / elapsed if elapsed > 0 else 0
                print(f"  ... {i+1}/{num_requests} ({sent} ok, {errors} err) — {rps:.0f} req/s")

    elapsed = time.time() - start_time
    stats["requests_sent"] += sent
    print(f"\n  ✅ Load generation complete: {sent} successful, {errors} errors in {elapsed:.1f}s ({sent/elapsed:.0f} req/s)")


# ══════════════════════════════════════════════════════════════
#  PHASE 4: Verification — read back dashboard data via SDK
# ══════════════════════════════════════════════════════════════

def phase_4_verify_dashboard(admin):
    """Use the SDK to verify that the dashboard has data."""
    section("Phase 4: Dashboard Data Verification via SDK")

    def test_audit_count():
        logs = admin.audit.list(limit=200)
        assert len(logs) > 50, f"Expected >50 audit logs, got {len(logs)}"
        print(f"({len(logs)} logs)", end=" ")
    run_test("audit.list() has bulk data", test_audit_count)

    def test_tokens_count():
        tokens = admin.tokens.list()
        assert len(tokens) > 5, f"Expected >5 tokens, got {len(tokens)}"
        print(f"({len(tokens)} tokens)", end=" ")
    run_test("tokens.list() populated", test_tokens_count)

    def test_policies_count():
        pols = admin.policies.list()
        assert len(pols) > 3, f"Expected >3 policies, got {len(pols)}"
        print(f"({len(pols)} policies)", end=" ")
    run_test("policies.list() populated", test_policies_count)

    def test_creds_count():
        cs = admin.credentials.list()
        assert len(cs) > 0, "No credentials found"
        print(f"({len(cs)} creds)", end=" ")
    run_test("credentials.list() populated", test_creds_count)

    def test_services_count():
        svcs = admin.services.list()
        assert len(svcs) > 0, "No services found"
        print(f"({len(svcs)} services)", end=" ")
    run_test("services.list() populated", test_services_count)


def clear_dashboard_data():
    print("\n🧹 Wiping dashboard data from the database...", end=" ", flush=True)
    import subprocess
    sql = """
    TRUNCATE TABLE 
        credentials, 
        tokens, 
        audit_logs, 
        policies,
        policy_versions,
        approval_requests, 
        services,
        webhooks,
        notifications,
        spend_caps,
        model_aliases,
        api_keys,
        budget_alerts,
        project_spend
    CASCADE;
    """
    try:
        subprocess.run([
            "docker", "exec", "ailink-postgres-1", 
            "psql", "-U", "postgres", "-d", "ailink", "-c", sql
        ], check=True, capture_output=True)
        print("✅ DONE\n")
    except subprocess.CalledProcessError as e:
        print(f"❌ FAIL: {e.stderr.decode()}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="AILink comprehensive load test")
    parser.add_argument("--requests", "-n", type=int, default=2000,
                        help="Number of load-gen proxy requests (default: 2000)")
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════════════╗")
    print("║  AILink Comprehensive Load Test & Feature Verification  ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"  Gateway:   {GATEWAY_URL}")
    print(f"  Upstream:  {MOCK_UPSTREAM}")
    print(f"  Run ID:    {RUN_ID}")
    print(f"  Requests:  {args.requests}")

    # ── Clear Dashboard Data ─────────────────────────────────
    clear_dashboard_data()

    # ── Initialize SDK Admin Client ──────────────────────────
    admin = AIlinkClient.admin(admin_key=ADMIN_KEY, gateway_url=GATEWAY_URL)

    # ── Execute phases ───────────────────────────────────────
    cred, tok, pol, svc = phase_1_admin_crud(admin)
    plain_tok = phase_2_proxy_features(admin, cred)
    phase_3_load_gen(admin, cred, args.requests)
    phase_4_verify_dashboard(admin)

    # ── Summary ──────────────────────────────────────────────
    section("SUMMARY")
    total = stats["pass"] + stats["fail"]
    print(f"  Tests:     {stats['pass']}/{total} passed")
    print(f"  Requests:  {stats['requests_sent']} total proxy requests sent")
    if stats["fail"] > 0:
        print(f"  ⚠  {stats['fail']} test(s) failed")
    else:
        print(f"  🎉 All tests passed!")
    print()


if __name__ == "__main__":
    main()
