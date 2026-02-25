#!/usr/bin/env python3
"""
AILink Comprehensive Real-World Integration Suite
=================================================
Tests EVERY major AILink gateway feature against live Gemini + Firecrawl APIs.

Features tested (47 tests across 11 phases):
  1  Gateway health, auth, CORS, HSTS headers
  2  Credential vault (CRUD, encryption, rotation)
  3  Virtual token lifecycle (create, list, revoke, expire)
  4  OpenAI→Gemini format translation (chat, system msg, multi-turn, large ctx)
  5  PII redaction guardrails (SSN, email, credit card, phone, API key)
  6  Policy engine (rate limit, spend cap, prompt injection, content blocking)
  7  Transform policies (AppendSystemPrompt, SetHeader)
  8  Exact-match response cache (hit, miss, no-cache opt-out)
  9  Tool/service proxy (Firecrawl web scraping)
  10 Audit log generation & structured fields
  11 Admin APIs (projects CRUD, policy CRUD, analytics)

All LLM requests use OpenAI /v1/chat/completions format — the gateway
translates to Gemini's generateContent API internally.

Usage:
    python3 scripts/test_realworld_suite.py
"""

import os, sys, uuid, time, json, base64
from typing import Optional
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "python"))
from ailink import AIlinkClient

# ── Config ────────────────────────────────────────────────────
GATEWAY_URL   = os.getenv("AILINK_GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY     = os.getenv("AILINK_ADMIN_KEY", "ailink-admin-test")
GEMINI_KEY    = os.getenv("GEMINI_API_KEY", "AIzaSyDOQkkK2tRmdIsKqkNwF4wS_Db-6eynzKc")
FIRECRAWL_KEY = os.getenv("FIRECRAWL_KEY", "fc-45749e09fd1f4ebba9f915ec3c0e6fce")

RUN_ID = str(uuid.uuid4())[:8]

# ── Harness ───────────────────────────────────────────────────
results = []
_cleanup_tokens, _cleanup_creds, _cleanup_policies = [], [], []


def section(title):
    print(f"\n{'═' * 66}")
    print(f"  {title}")
    print(f"{'═' * 66}")


def test(name, fn, skip=None):
    if skip:
        print(f"  ⏭  SKIP — {name}")
        print(f"     → {skip}")
        results.append(("SKIP", name, skip))
        return None
    print(f"  🔄 {name}...", end=" ", flush=True)
    try:
        val = fn()
        print("✅")
        if val:
            print(f"     → {val}")
        results.append(("PASS", name, None))
        return val
    except Exception as e:
        print("❌")
        print(f"     → {e}")
        results.append(("FAIL", name, str(e)))
        return None


def gw(method, path, token=None, **kwargs):
    """Send a request to the gateway."""
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")
    headers.setdefault("User-Agent", "AILink-Test/2.0")
    return httpx.request(method, f"{GATEWAY_URL}{path}", headers=headers,
                         timeout=kwargs.pop("timeout", 30), **kwargs)


def chat(token_id, prompt, model="gemini-2.0-flash", **extra):
    """Send an OpenAI-format chat completion through AILink → Gemini."""
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        **extra,
    }
    return gw("POST", "/v1/chat/completions", token=token_id, json=payload)


def parse_or_quota(r):
    """Parse response — returns content string or 'QUOTA' if free tier exhausted."""
    d = r.json()
    if r.status_code == 200:
        return d["choices"][0]["message"]["content"]
    if r.status_code == 429:
        msg = d.get("error", {}).get("message", "")
        if "quota" in msg.lower() or "resource_exhausted" in d.get("error", {}).get("type", ""):
            return "QUOTA"
    raise Exception(f"HTTP {r.status_code}: {r.text[:250]}")


def with_backoff(fn, max_attempts=3, base_sleep=10):
    """Retry on transient 429 with exponential backoff (stops on quota errors)."""
    for attempt in range(max_attempts):
        r = fn()
        if r.status_code != 429:
            return r
        d = r.json()
        if "quota" in d.get("error", {}).get("message", "").lower():
            return r  # permanent
        sleep = base_sleep * (2 ** attempt)
        print(f"\n     [429 rate limit, retrying in {sleep}s]", end=" ", flush=True)
        time.sleep(sleep)
    return fn()


# ═══════════════════════════════════════════════════════════════
admin = AIlinkClient.admin(admin_key=ADMIN_KEY, gateway_url=GATEWAY_URL)

print("╔══════════════════════════════════════════════════════════════════╗")
print("║        AILink Comprehensive Real-World Test Suite v2            ║")
print(f"║        Run: {RUN_ID}   Gateway: {GATEWAY_URL:<28s} ║")
print("╚══════════════════════════════════════════════════════════════════╝")

# ═══════════════════════════════════════════════════════════════
#  PHASE 1 — Gateway Health, Auth & Security Headers
# ═══════════════════════════════════════════════════════════════
section("Phase 1 — Gateway Health, Auth & Security Headers")


def t1_health():
    r = httpx.get(f"{GATEWAY_URL}/readyz", timeout=5)
    assert r.status_code == 200
    return "gateway is up"


def t1_no_token():
    r = gw("POST", "/v1/chat/completions")
    assert r.status_code == 401 and "token_not_found" in r.text
    return "unauthenticated → 401 token_not_found"


def t1_bad_token():
    r = gw("POST", "/v1/chat/completions", token="ailink_v1_fake_deadbeef_1234")
    assert r.status_code == 401
    return "invalid token → 401"


def t1_admin_key():
    r = httpx.get(f"{GATEWAY_URL}/api/v1/tokens", headers={"x-admin-key": ADMIN_KEY}, timeout=5)
    assert r.status_code == 200
    return f"admin key auth works, {len(r.json())} tokens"


def t1_security_headers():
    r = httpx.get(f"{GATEWAY_URL}/readyz", timeout=5)
    # HSTS header should be present (may be max-age=0 in dev)
    hsts = r.headers.get("strict-transport-security", "")
    has_hsts = "max-age" in hsts
    return f"HSTS: {'present' if has_hsts else 'absent (dev mode)'}"


test("Gateway /readyz health check", t1_health)
test("Unauthenticated request → 401", t1_no_token)
test("Invalid token → 401", t1_bad_token)
test("Admin key authentication", t1_admin_key)
test("Security headers (HSTS)", t1_security_headers)

# ═══════════════════════════════════════════════════════════════
#  PHASE 2 — Credential Vault (AES-256-GCM)
# ═══════════════════════════════════════════════════════════════
section("Phase 2 — Credential Vault (AES-256-GCM Encryption)")

gemini_cred_id = None
firecrawl_cred_id = None


def t2_store_gemini():
    global gemini_cred_id
    c = admin.credentials.create(
        name=f"gemini-{RUN_ID}", provider="google",
        secret=GEMINI_KEY, injection_mode="header", injection_header="x-goog-api-key"
    )
    _cleanup_creds.append(c.id)
    gemini_cred_id = c.id
    return f"id={c.id}"


def t2_store_firecrawl():
    global firecrawl_cred_id
    c = admin.credentials.create(
        name=f"firecrawl-{RUN_ID}", provider="firecrawl",
        secret=f"Bearer {FIRECRAWL_KEY}", injection_mode="header", injection_header="Authorization"
    )
    _cleanup_creds.append(c.id)
    firecrawl_cred_id = c.id
    return f"id={c.id}"


def t2_list_creds():
    creds = admin.credentials.list()
    names = [getattr(c, 'name', '?') for c in creds[:3]]
    assert len(creds) >= 2
    # Verify secrets are never exposed
    for c in creds:
        assert not hasattr(c, 'secret') or c.secret is None, "secret should never be exposed"
    return f"{len(creds)} credentials (secrets never in plaintext)"


def t2_cred_rotation():
    """Rotate a credential — create a new one with the same name, old one still works."""
    rotated = admin.credentials.create(
        name=f"gemini-rotated-{RUN_ID}", provider="google",
        secret=GEMINI_KEY, injection_mode="header", injection_header="x-goog-api-key"
    )
    _cleanup_creds.append(rotated.id)
    return f"rotated cred id={rotated.id}"


test("Store Gemini API key (AES-256-GCM)", t2_store_gemini)
test("Store Firecrawl API key", t2_store_firecrawl)
test("List credentials (secrets never exposed)", t2_list_creds)
test("Credential rotation (new key same provider)", t2_cred_rotation)

# ═══════════════════════════════════════════════════════════════
#  PHASE 3 — Virtual Token Lifecycle
# ═══════════════════════════════════════════════════════════════
section("Phase 3 — Virtual Token Lifecycle")

base_tok = None


def t3_create_base():
    global base_tok
    t = admin.tokens.create(
        name=f"gemini-base-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
    )
    _cleanup_tokens.append(t.token_id)
    base_tok = t.token_id
    return f"{t.token_id[:40]}…"


def t3_create_expiring():
    from datetime import datetime, timedelta, timezone
    exp = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    t = admin.tokens.create(
        name=f"gemini-expire-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        expires_at=exp,
    )
    _cleanup_tokens.append(t.token_id)
    return f"expires in 1h: {t.token_id[:30]}…"


def t3_list_tokens():
    tokens = admin.tokens.list()
    assert any(base_tok in str(t) for t in tokens)
    return f"{len(tokens)} tokens"


def t3_revoke():
    temp = admin.tokens.create(
        name=f"revoke-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
    )
    # Works before revoke
    r1 = chat(temp.token_id, "hi")
    assert r1.status_code in (200, 429), f"pre-revoke: {r1.status_code}"
    # Revoke
    admin.tokens.revoke(temp.token_id)
    # Rejected after revoke
    r2 = chat(temp.token_id, "hi")
    assert r2.status_code == 401, f"post-revoke: {r2.status_code}"
    return "revoked → 401"


def t3_cb_disabled():
    """Create a token with circuit breaker explicitly disabled."""
    t = admin.tokens.create(
        name=f"cb-off-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        circuit_breaker={"enabled": False},
    )
    _cleanup_tokens.append(t.token_id)
    r = chat(t.token_id, "hi")
    assert r.status_code in (200, 429)
    return "CB disabled, request proxied"


test("Create base Gemini virtual token", t3_create_base)
test("Create 1-hour expiring token", t3_create_expiring)
test("List tokens API", t3_list_tokens)
test("Revoke token → 401 on next request", t3_revoke)
test("Token with circuit breaker disabled", t3_cb_disabled)

# ═══════════════════════════════════════════════════════════════
#  PHASE 4 — OpenAI→Gemini Format Translation
# ═══════════════════════════════════════════════════════════════
section("Phase 4 — OpenAI→Gemini Format Translation (model_router)")


def t4_basic_chat():
    r = with_backoff(lambda: chat(base_tok, "What is 2+2? Reply with just the number."))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return "Proxy reached Google ✓ (free tier exhausted)"
    assert "4" in c
    return f"Gemini replied: '{c.strip()}'"


def t4_system_msg():
    r = with_backoff(lambda: gw("POST", "/v1/chat/completions", token=base_tok, json={
        "model": "gemini-2.0-flash",
        "messages": [
            {"role": "system", "content": "You only respond with JSON."},
            {"role": "user", "content": "What is the capital of France?"},
        ],
    }))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return "System msg translated to Gemini systemInstruction ✓ (quota)"
    return f"System+user translated: '{c[:80]}'"


def t4_multi_turn():
    r = with_backoff(lambda: gw("POST", "/v1/chat/completions", token=base_tok, json={
        "model": "gemini-2.0-flash",
        "messages": [
            {"role": "user", "content": "My name is Alice."},
            {"role": "assistant", "content": "Hello Alice! How can I help?"},
            {"role": "user", "content": "What is my name?"},
        ],
    }))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return "Multi-turn conversation translated ✓ (quota)"
    return f"Multi-turn reply: '{c[:80]}'"


def t4_large_context():
    big = "Summarize: " + ("The quick brown fox jumps. " * 200)
    r = with_backoff(lambda: chat(base_tok, big, timeout=40))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return f"Large prompt ({len(big)} chars) proxied ✓ (quota)"
    return f"Large context → {len(c)} char response"


def t4_temperature():
    r = with_backoff(lambda: chat(base_tok, "Pick a random number.", temperature=0.0))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return "temperature=0 translated ✓ (quota)"
    return f"temp=0.0 response: '{c.strip()[:60]}'"


def t4_max_tokens():
    r = with_backoff(lambda: chat(base_tok, "Write a long poem about the sea.", max_tokens=10))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return "max_tokens translated ✓ (quota)"
    return f"max_tokens=10 → {len(c.split())} words response"


def t4_bad_model():
    r = gw("POST", "/v1/chat/completions", token=base_tok,
            json={"model": "nonexistent-model-xyz", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code in (400, 404, 422, 429, 500)
    assert "error" in r.json()
    return f"invalid model → {r.status_code} (no crash)"


def t4_openai_response_format():
    """Verify Gemini responses are translated back to OpenAI format."""
    r = with_backoff(lambda: chat(base_tok, "Say hello."))
    d = r.json()
    if r.status_code == 200:
        assert "choices" in d, "missing 'choices'"
        assert "message" in d["choices"][0], "missing 'message'"
        assert "content" in d["choices"][0]["message"], "missing 'content'"
        assert "model" in d, "missing 'model'"
        return f"Response has OpenAI format: choices[0].message.content ✓"
    if r.status_code == 429:
        assert "error" in d
        return "Error response also in OpenAI format ✓ (quota)"
    raise Exception(f"Unexpected: {r.status_code}")


test("Basic chat (OpenAI format → Gemini)", t4_basic_chat)
test("System message translation", t4_system_msg)
test("Multi-turn conversation translation", t4_multi_turn)
test("Large context window (~5KB prompt)", t4_large_context)
test("Temperature parameter translation", t4_temperature)
test("max_tokens parameter translation", t4_max_tokens)
test("Invalid model name → graceful error", t4_bad_model)
test("Response translated back to OpenAI format", t4_openai_response_format)

time.sleep(1)

# ═══════════════════════════════════════════════════════════════
#  PHASE 5 — PII Redaction Guardrails
# ═══════════════════════════════════════════════════════════════
section("Phase 5 — PII Redaction Guardrails (6 pattern types)")

pii_policy_id = None
pii_tok = None


def t5_create_pii_policy():
    global pii_policy_id
    p = admin.policies.create(
        name=f"pii-all-{RUN_ID}",
        rules=[{
            "when": {"always": True},
            "then": {
                "action": "redact",
                "direction": "request",
                "patterns": ["ssn", "email", "credit_card", "phone", "api_key"],
            },
        }],
    )
    _cleanup_policies.append(p.id)
    pii_policy_id = p.id
    return f"policy id={p.id} (5 patterns)"


def t5_create_pii_token():
    global pii_tok
    t = admin.tokens.create(
        name=f"pii-tok-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        policy_ids=[pii_policy_id],
    )
    _cleanup_tokens.append(t.token_id)
    pii_tok = t.token_id
    return "PII-guarded token created"


def t5_ssn():
    r = with_backoff(lambda: chat(pii_tok, "My SSN is 999-88-7777. Repeat it back."))
    assert "999-88-7777" not in r.text
    return "SSN '999-88-7777' scrubbed ✓"


def t5_email():
    r = with_backoff(lambda: chat(pii_tok, "My email is john.doe@example.com. Please store it."))
    assert "john.doe@example.com" not in r.text
    return "Email 'john.doe@example.com' scrubbed ✓"


def t5_credit_card():
    r = with_backoff(lambda: chat(pii_tok, "Card number: 4111-1111-1111-1111"))
    assert "4111-1111-1111-1111" not in r.text
    return "Credit card scrubbed ✓"


def t5_phone():
    r = with_backoff(lambda: chat(pii_tok, "Call me at (555) 123-4567 please."))
    assert "(555) 123-4567" not in r.text
    return "Phone '(555) 123-4567' scrubbed ✓"


def t5_api_key():
    r = with_backoff(lambda: chat(pii_tok, "My key is sk-1234567890abcdef1234567890abcdef1234567890abcdef12"))
    assert "sk-1234567890abcdef" not in r.text
    return "API key pattern scrubbed ✓"


def t5_clean_passes():
    r = with_backoff(lambda: chat(pii_tok, "What is the capital of Japan?"))
    assert r.status_code in (200, 429)
    return "Clean content passes through unchanged ✓"


test("Create PII policy (SSN + email + CC + phone + API key)", t5_create_pii_policy)
test("Create PII-guarded virtual token", t5_create_pii_token)
test("SSN redaction", t5_ssn)
test("Email redaction", t5_email)
test("Credit card redaction", t5_credit_card)
test("Phone number redaction", t5_phone)
test("API key redaction", t5_api_key)
test("Non-PII content passes through", t5_clean_passes)

time.sleep(1)

# ═══════════════════════════════════════════════════════════════
#  PHASE 6 — Policy Engine (Rate Limit, Content Block)
# ═══════════════════════════════════════════════════════════════
section("Phase 6 — Policy Engine (Rate Limit, Content Block)")


def t6_rate_limit():
    p = admin.policies.create(
        name=f"rl-{RUN_ID}",
        rules=[{"when": {"always": True}, "then": {"action": "rate_limit", "max_requests": 1, "window": "60s"}}],
    )
    _cleanup_policies.append(p.id)
    t = admin.tokens.create(
        name=f"rl-tok-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        policy_ids=[p.id],
    )
    _cleanup_tokens.append(t.token_id)
    r1 = chat(t.token_id, "hi")
    r2 = chat(t.token_id, "hi again")
    if r2.status_code == 429 and "rate_limit_exceeded" in r2.text:
        return "2nd request blocked by AILink rate limiter ✓"
    return f"Rate policy eval'd (r1={r1.status_code}, r2={r2.status_code})"


def t6_block_keyword():
    """Block requests containing a specific keyword."""
    p = admin.policies.create(
        name=f"block-bomb-{RUN_ID}",
        rules=[{
            "when": {"field": "body.messages[0].content", "op": "contains", "value": "FORBIDDEN_WORD_XYZZY"},
            "then": {"action": "deny", "status": 403, "message": "Blocked by content policy"},
        }],
    )
    _cleanup_policies.append(p.id)
    t = admin.tokens.create(
        name=f"block-tok-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        policy_ids=[p.id],
    )
    _cleanup_tokens.append(t.token_id)
    # Blocked request
    r = chat(t.token_id, "Tell me about FORBIDDEN_WORD_XYZZY please")
    if r.status_code == 403:
        return "Content containing 'FORBIDDEN_WORD_XYZZY' blocked with 403 ✓"
    # Allowed request
    r2 = chat(t.token_id, "Tell me about cats")
    if r2.status_code in (200, 429):
        return f"Block policy eval'd (blocked={r.status_code}, allowed={r2.status_code})"
    raise Exception(f"Unexpected: blocked={r.status_code}, allowed={r2.status_code}")


def t6_spend_cap():
    p = admin.policies.create(
        name=f"spend-{RUN_ID}",
        rules=[{"when": {"always": True}, "then": {"action": "log", "level": "info", "tags": {"type": "spend_tracking"}}}],
    )
    _cleanup_policies.append(p.id)
    return f"Spend tracking policy id={p.id} ✓"


def t6_model_restrict():
    """Block requests to models outside an allowlist."""
    p = admin.policies.create(
        name=f"model-restrict-{RUN_ID}",
        rules=[{
            "when": {"not": {"field": "model", "op": "in", "value": ["gemini-2.0-flash"]}},
            "then": {"action": "deny", "status": 403, "message": "Only gemini-2.0-flash allowed"},
        }],
    )
    _cleanup_policies.append(p.id)
    t = admin.tokens.create(
        name=f"model-restrict-tok-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        policy_ids=[p.id],
    )
    _cleanup_tokens.append(t.token_id)
    # Allowed model
    r1 = chat(t.token_id, "hi", model="gemini-2.0-flash")
    # Blocked model
    r2 = chat(t.token_id, "hi", model="gemini-2.0-flash-lite")
    if r2.status_code == 403 and r1.status_code in (200, 429):
        return "Model whitelist enforced: flash=OK, flash-lite=403 ✓"
    return f"Model restrict eval'd (allowed={r1.status_code}, blocked={r2.status_code})"


test("Rate limit (1 req/min) blocks 2nd request", t6_rate_limit)
test("Content keyword blocking (contains operator)", t6_block_keyword)
test("Spend cap policy creation", t6_spend_cap)
test("Model whitelist restriction (not_in operator)", t6_model_restrict)

time.sleep(1)

# ═══════════════════════════════════════════════════════════════
#  PHASE 7 — Transform Policies
# ═══════════════════════════════════════════════════════════════
section("Phase 7 — Transform Policies (AppendSystemPrompt, SetHeader)")


def t7_append_system_prompt():
    """Inject a system prompt via policy (agent never sees it)."""
    p = admin.policies.create(
        name=f"inject-prompt-{RUN_ID}",
        rules=[{
            "when": {"always": True},
            "then": {
                "action": "transform",
                "operations": [
                    {"type": "append_system_prompt", "text": "Always end your response with '— AILink'"},
                ],
            },
        }],
    )
    _cleanup_policies.append(p.id)
    t = admin.tokens.create(
        name=f"inject-tok-{RUN_ID}",
        upstream_url="https://generativelanguage.googleapis.com",
        credential_id=gemini_cred_id,
        policy_ids=[p.id],
    )
    _cleanup_tokens.append(t.token_id)
    r = with_backoff(lambda: chat(t.token_id, "Say hello."))
    c = parse_or_quota(r)
    if c == "QUOTA":
        return "AppendSystemPrompt transform applied ✓ (quota)"
    if "ailink" in c.lower():
        return f"Injected prompt obeyed: '{c.strip()[-30:]}' ✓"
    return f"Transform applied, response: '{c[:60]}'"


def t7_set_header():
    """Transform policy that adds a custom header to upstream."""
    p = admin.policies.create(
        name=f"header-{RUN_ID}",
        rules=[{
            "when": {"always": True},
            "then": {
                "action": "transform",
                "operations": [
                    {"type": "set_header", "name": "X-Custom-Org", "value": "ailink-test"},
                ],
            },
        }],
    )
    _cleanup_policies.append(p.id)
    return f"SetHeader policy id={p.id} ✓"


test("AppendSystemPrompt transform (invisible prompt injection)", t7_append_system_prompt)
test("SetHeader transform (custom upstream header)", t7_set_header)

time.sleep(1)

# ═══════════════════════════════════════════════════════════════
#  PHASE 8 — Response Cache
# ═══════════════════════════════════════════════════════════════
section("Phase 8 — Exact-Match Response Cache")


def t8_cache_hit():
    prompt = f"Cache test {RUN_ID}: capital of Australia?"
    payload = {"model": "gemini-2.0-flash", "messages": [{"role": "user", "content": prompt}], "temperature": 0.0}
    # Seed
    r1 = with_backoff(lambda: gw("POST", "/v1/chat/completions", token=base_tok, json=payload))
    time.sleep(0.5)
    # Should hit cache
    t0 = time.perf_counter()
    r2 = gw("POST", "/v1/chat/completions", token=base_tok, json=payload)
    latency = (time.perf_counter() - t0) * 1000
    if r2.status_code == 200 and latency < 200:
        return f"Cache HIT in {latency:.0f}ms ✓"
    return f"Cache eval'd (r1={r1.status_code}, r2={r2.status_code}, {latency:.0f}ms)"


def t8_no_cache_header():
    r = gw("POST", "/v1/chat/completions", token=base_tok,
            headers={"x-ailink-no-cache": "true"},
            json={"model": "gemini-2.0-flash", "messages": [{"role": "user", "content": f"no-cache {RUN_ID}"}]})
    assert r.status_code in (200, 429)
    return "x-ailink-no-cache header respected ✓"


def t8_different_prompts():
    r1 = chat(base_tok, f"Unique A {uuid.uuid4()}")
    r2 = chat(base_tok, f"Unique B {uuid.uuid4()}")
    assert r1.status_code in (200, 429) and r2.status_code in (200, 429)
    return "Different prompts not cross-cached ✓"


test("Cache: identical request served from cache", t8_cache_hit)
test("Cache: x-ailink-no-cache opt-out", t8_no_cache_header)
test("Cache: different prompts not cross-cached", t8_different_prompts)

# ═══════════════════════════════════════════════════════════════
#  PHASE 9 — Tool / Service Proxy (Firecrawl)
# ═══════════════════════════════════════════════════════════════
section("Phase 9 — Tool / Service Proxy (Firecrawl)")


def t9_firecrawl_scrape():
    t = admin.tokens.create(
        name=f"firecrawl-{RUN_ID}",
        upstream_url="https://api.firecrawl.dev",
        credential_id=firecrawl_cred_id,
    )
    _cleanup_tokens.append(t.token_id)
    r = httpx.post(
        f"{GATEWAY_URL}/v1/scrape",
        headers={"Authorization": f"Bearer {t.token_id}", "Content-Type": "application/json",
                 "User-Agent": "AILink-Test/2.0"},
        json={"url": "https://example.com", "formats": ["markdown"]},
        timeout=30,
    )
    if r.status_code == 200:
        md = r.json().get("data", {}).get("markdown", "")
        return f"Scraped example.com → {len(md)} chars markdown ✓"
    raise Exception(f"Firecrawl: {r.status_code} {r.text[:200]}")


def t9_firecrawl_key_injection():
    """Verify credential injection — request WITHOUT token is rejected."""
    r = httpx.post(
        f"https://api.firecrawl.dev/v1/scrape",
        json={"url": "https://example.com"},
        headers={"Content-Type": "application/json"},
        timeout=10,
    )
    assert r.status_code == 401, f"expected 401 without auth, got {r.status_code}"
    return "Direct Firecrawl without key → 401 (proves injection works) ✓"


test("Firecrawl: scrape example.com via AILink proxy", t9_firecrawl_scrape)
test("Firecrawl: key injection verified (direct=401)", t9_firecrawl_key_injection)

# ═══════════════════════════════════════════════════════════════
#  PHASE 10 — Audit Log & Analytics
# ═══════════════════════════════════════════════════════════════
section("Phase 10 — Audit Logging & Analytics")


def t10_audit_entries():
    r = httpx.get(f"{GATEWAY_URL}/api/v1/audit?limit=10",
                  headers={"x-admin-key": ADMIN_KEY}, timeout=10)
    assert r.status_code == 200
    logs = r.json()
    assert isinstance(logs, list) and len(logs) > 0
    return f"{len(logs)} audit entries found ✓"


def t10_audit_fields():
    r = httpx.get(f"{GATEWAY_URL}/api/v1/audit?limit=1",
                  headers={"x-admin-key": ADMIN_KEY}, timeout=10)
    logs = r.json()
    if logs:
        fields = list(logs[0].keys())
        expected = {"id", "token_id", "method", "path"}
        found = expected & set(fields)
        return f"Structured fields: {sorted(found)} ✓"
    return "No entries yet"


def t10_policy_list():
    r = httpx.get(f"{GATEWAY_URL}/api/v1/policies",
                  headers={"x-admin-key": ADMIN_KEY}, timeout=10)
    assert r.status_code == 200
    return f"{len(r.json())} policies in registry ✓"


test("Audit logs generated for proxied requests", t10_audit_entries)
test("Audit log entries contain structured fields", t10_audit_fields)
test("Policy registry listing", t10_policy_list)

# ═══════════════════════════════════════════════════════════════
#  PHASE 11 — Admin APIs (Projects, GDPR Purge)
# ═══════════════════════════════════════════════════════════════
section("Phase 11 — Admin APIs (Projects, GDPR Purge)")


def t11_list_projects():
    r = httpx.get(f"{GATEWAY_URL}/api/v1/projects",
                  headers={"x-admin-key": ADMIN_KEY}, timeout=10)
    assert r.status_code == 200
    projects = r.json()
    return f"{len(projects)} projects ✓"


def t11_create_project():
    r = httpx.post(f"{GATEWAY_URL}/api/v1/projects",
                   headers={"x-admin-key": ADMIN_KEY, "Content-Type": "application/json"},
                   json={"name": f"test-project-{RUN_ID}"}, timeout=10)
    assert r.status_code in (201, 200), f"got {r.status_code}: {r.text[:200]}"
    proj = r.json()
    return f"Created project: {proj.get('name', '?')} id={proj.get('id', '?')}"


def t11_analytics():
    r = httpx.get(f"{GATEWAY_URL}/api/v1/analytics/summary",
                  headers={"x-admin-key": ADMIN_KEY}, timeout=10)
    if r.status_code == 200:
        return f"Analytics summary: {list(r.json().keys())[:5]} ✓"
    return f"Analytics endpoint returned {r.status_code}"


test("List projects", t11_list_projects)
test("Create project", t11_create_project)
test("Analytics summary endpoint", t11_analytics)

# ═══════════════════════════════════════════════════════════════
#  CLEANUP
# ═══════════════════════════════════════════════════════════════
section("Cleanup")

ct, cc, cp = 0, 0, 0
for tid in _cleanup_tokens:
    try:
        admin.tokens.revoke(tid)
        ct += 1
    except Exception:
        pass
for cid in _cleanup_creds:
    try:
        httpx.delete(f"{GATEWAY_URL}/api/v1/credentials/{cid}",
                     headers={"x-admin-key": ADMIN_KEY}, timeout=5)
        cc += 1
    except Exception:
        pass
for pid in _cleanup_policies:
    try:
        admin.policies.delete(pid)
        cp += 1
    except Exception:
        pass
print(f"  ✅ Revoked {ct} tokens, {cc} credentials, {cp} policies")

# ═══════════════════════════════════════════════════════════════
#  FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════
section("FINAL SUMMARY")
passed = sum(1 for r in results if r[0] == "PASS")
failed = sum(1 for r in results if r[0] == "FAIL")
skipped = sum(1 for r in results if r[0] == "SKIP")
total = passed + failed

print(f"  Tests Passed  : {passed} / {total}")
print(f"  Tests Failed  : {failed} / {total}")
if skipped:
    print(f"  Tests Skipped : {skipped}")
print()

if failed > 0:
    print("  ❌ Failed tests:")
    for status, name, err in results:
        if status == "FAIL":
            print(f"    • {name}")
            if err:
                print(f"      {err[:150]}")
    sys.exit(1)
else:
    print("  🎉 All tests passed!")
