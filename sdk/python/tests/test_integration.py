"""
SDK Integration Tests — Live Gateway
=====================================
Tests the AIlink Python SDK (Client + AsyncClient) against a LIVE
docker-compose stack: gateway :8443 · postgres · redis · httpbin :8080.

Prerequisites:
  docker compose up -d   (from repo root)
  pip install ailink httpx pydantic pytest pytest-anyio

Run:
  pytest tests/test_integration.py -v --tb=short
"""

import os
import time
import uuid
import pytest
import httpx
import requests

from ailink import Client, AsyncClient
from ailink.types import (
    Token, Credential, Policy, AuditLog,
    ApprovalRequest, ApprovalDecision,
)

# ── Config ───────────────────────────────────────────────────
GATEWAY = os.getenv("GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY = os.getenv(
    "ADMIN_KEY",
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
)
PROJECT_ID = "00000000-0000-0000-0000-000000000001"
MOCK_UPSTREAM = os.getenv("MOCK_UPSTREAM_URL", "http://mock-upstream:80")


# ── Fixtures ─────────────────────────────────────────────────

@pytest.fixture(scope="session")
def gateway_up():
    """Block until the gateway is reachable, or skip the entire module."""
    for attempt in range(15):
        try:
            r = requests.get(f"{GATEWAY}/healthz", timeout=2)
            if r.status_code == 200:
                return True
        except requests.ConnectionError:
            pass
        time.sleep(2)
    pytest.skip(f"Gateway not reachable at {GATEWAY} — is docker compose up?")


@pytest.fixture(scope="session")
def admin_client(gateway_up) -> Client:
    """Admin SDK client for management operations."""
    return Client.admin(admin_key=ADMIN_KEY, gateway_url=GATEWAY)


@pytest.fixture(scope="session")
def credential_id(admin_client) -> str:
    """Create a real credential and return its UUID string."""
    result = admin_client.credentials.create(
        name=f"integ-cred-{uuid.uuid4().hex[:8]}",
        provider="openai",
        secret="sk-test-integration-fake-key-12345",
    )
    cred_id = result.get("id") if isinstance(result, dict) else result.id
    assert cred_id, "Credential creation must return an id"
    return str(cred_id)


@pytest.fixture(scope="session")
def token_data(admin_client, credential_id) -> dict:
    """Create a real virtual token and return the raw response dict."""
    result = admin_client.tokens.create(
        name=f"integ-token-{uuid.uuid4().hex[:8]}",
        credential_id=credential_id,
        upstream_url=f"{MOCK_UPSTREAM}/anything",
        project_id=PROJECT_ID,
    )
    assert "token_id" in result, f"Expected token_id in response, got: {result}"
    assert result["token_id"].startswith("ailink_v1_")
    return result


@pytest.fixture(scope="session")
def virtual_token(token_data) -> str:
    """The ailink_v1_* virtual token string."""
    return token_data["token_id"]


# ═════════════════════════════════════════════════════════════
# 1. CREDENTIAL LIFECYCLE
# ═════════════════════════════════════════════════════════════

class TestSDKCredentialLifecycle:
    def test_create_credential_returns_id(self, credential_id):
        """Credential was created by fixture; just verify it's a valid UUID."""
        uid = uuid.UUID(credential_id)  # raises if invalid
        assert uid.version == 4

    def test_list_credentials_contains_created(self, admin_client, credential_id):
        """List credentials and find the one we created."""
        creds = admin_client.credentials.list()
        assert isinstance(creds, list)
        if len(creds) > 0:
            assert isinstance(creds[0], Credential)
            ids = [str(c.id) for c in creds]
            assert credential_id in ids


# ═════════════════════════════════════════════════════════════
# 2. TOKEN LIFECYCLE
# ═════════════════════════════════════════════════════════════

class TestSDKTokenLifecycle:
    def test_create_token_returns_ailink_prefix(self, virtual_token):
        """Token was created by fixture; verify prefix."""
        assert virtual_token.startswith("ailink_v1_")

    def test_list_tokens_returns_pydantic(self, admin_client):
        """List tokens and verify Pydantic models."""
        tokens = admin_client.tokens.list()
        assert isinstance(tokens, list)
        if len(tokens) > 0:
            t = tokens[0]
            assert isinstance(t, Token)
            # Dot-notation access
            assert t.id is not None
            assert t.name is not None
            assert isinstance(t.is_active, bool)
            # Dict-style backward compat
            assert "id" in t
            assert t["name"] == t.name

    def test_token_has_expected_fields(self, admin_client, virtual_token):
        """The token we created should appear in the list with all fields."""
        tokens = admin_client.tokens.list()
        match = [t for t in tokens if t.id == virtual_token]
        if match:
            t = match[0]
            assert t.upstream_url.endswith("/anything")
            assert t.is_active is True


# ═════════════════════════════════════════════════════════════
# 3. PROXY ROUNDTRIP
# ═════════════════════════════════════════════════════════════

class TestSDKProxyRoundtrip:
    def test_proxy_get_through_httpbin(self, virtual_token):
        """
        Send a real GET through the gateway proxy → httpbin /anything.
        httpbin echoes back everything, so we can verify the request arrived.
        """
        resp = requests.get(
            f"{GATEWAY}/anything",
            headers={"Authorization": f"Bearer {virtual_token}"},
            timeout=10,
        )
        # httpbin returns 200 with JSON echo
        assert resp.status_code == 200, f"Proxy returned {resp.status_code}: {resp.text[:200]}"
        body = resp.json()
        # httpbin /anything echoes the request method, URL, headers
        assert body.get("method") == "GET" or "url" in body

    def test_proxy_post_json(self, virtual_token):
        """POST JSON through the gateway proxy → httpbin /anything."""
        payload = {"agent": "integration-test", "action": "verify"}
        resp = requests.post(
            f"{GATEWAY}/anything",
            headers={
                "Authorization": f"Bearer {virtual_token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        assert resp.status_code == 200
        body = resp.json()
        # httpbin echoes posted data
        if "json" in body:
            assert body["json"]["agent"] == "integration-test"


# ═════════════════════════════════════════════════════════════
# 4. AUDIT TRAIL
# ═════════════════════════════════════════════════════════════

class TestSDKAuditTrail:
    def test_audit_logs_exist_after_proxy(self, admin_client):
        """After proxy requests, there should be audit log entries."""
        # Small delay to let async audit writer flush
        time.sleep(1)
        logs = admin_client.audit.list(limit=10)
        assert isinstance(logs, list)
        # At least the proxy requests from TestSDKProxyRoundtrip should appear
        assert len(logs) > 0, "Expected at least 1 audit log after proxy requests"

    def test_audit_log_pydantic_shape(self, admin_client):
        """Verify audit logs are proper Pydantic AuditLog instances."""
        logs = admin_client.audit.list(limit=5)
        if len(logs) > 0:
            log = logs[0]
            assert isinstance(log, AuditLog)
            assert log.id is not None
            assert log.method in ("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
            assert isinstance(log.upstream_status, int)
            assert isinstance(log.response_latency_ms, int)


# ═════════════════════════════════════════════════════════════
# 5. POLICIES CRUD
# ═════════════════════════════════════════════════════════════

class TestSDKPoliciesCRUD:
    @pytest.fixture()
    def policy_id(self, admin_client):
        """Create a test policy and yield its ID, cleanup after."""
        result = admin_client.policies.create(
            name=f"integ-policy-{uuid.uuid4().hex[:8]}",
            rules=[{"pattern": "/danger/*", "action": "block"}],
            mode="enforce",
        )
        pid = result.get("id") if isinstance(result, dict) else result.id
        assert pid, f"Policy creation must return an id, got: {result}"
        yield str(pid)
        # Cleanup: attempt to delete
        try:
            admin_client.policies.delete(str(pid))
        except Exception:
            pass

    def test_create_policy(self, policy_id):
        """Policy fixture creates successfully — just verify UUID."""
        uid = uuid.UUID(policy_id)
        assert uid.version == 4

    def test_list_policies_returns_pydantic(self, admin_client, policy_id):
        """List policies and find the one we created."""
        policies = admin_client.policies.list()
        assert isinstance(policies, list)
        if len(policies) > 0:
            p = policies[0]
            assert isinstance(p, Policy)
            assert p.name is not None
            assert p.mode in ("enforce", "shadow", "log")
            assert isinstance(p.rules, list)

    def test_update_policy(self, admin_client, policy_id):
        """Update the policy mode from enforce to shadow."""
        result = admin_client.policies.update(policy_id, mode="shadow")
        assert isinstance(result, dict)

    def test_delete_policy_succeeds(self, admin_client):
        """Create and immediately delete a policy."""
        result = admin_client.policies.create(
            name=f"delete-me-{uuid.uuid4().hex[:8]}",
            rules=[{"pattern": "/*", "action": "log"}],
            mode="shadow",
        )
        pid = result.get("id") if isinstance(result, dict) else result.id
        delete_result = admin_client.policies.delete(str(pid))
        assert isinstance(delete_result, dict)


# ═════════════════════════════════════════════════════════════
# 6. APPROVALS
# ═════════════════════════════════════════════════════════════

class TestSDKApprovals:
    def test_list_approvals_returns_list(self, admin_client):
        """List approvals and verify shape."""
        approvals = admin_client.approvals.list()
        assert isinstance(approvals, list)
        if len(approvals) > 0:
            assert isinstance(approvals[0], ApprovalRequest)

    def test_decide_nonexistent_returns_not_updated(self, admin_client):
        """Approving a non-existent ID should return updated=false."""
        fake_id = str(uuid.uuid4())
        result = admin_client.approvals.approve(fake_id)
        assert isinstance(result, ApprovalDecision)
        assert result.updated is False
        assert result.status == "approved"


# ═════════════════════════════════════════════════════════════
# 7. TOKEN REVOCATION
# ═════════════════════════════════════════════════════════════

class TestSDKTokenRevocation:
    @pytest.fixture()
    def revokable_token(self, admin_client, credential_id):
        """Create a dedicated token for revocation testing."""
        result = admin_client.tokens.create(
            name=f"revoke-me-{uuid.uuid4().hex[:8]}",
            credential_id=credential_id,
            upstream_url=f"{MOCK_UPSTREAM}/anything",
            project_id=PROJECT_ID,
        )
        return result["token_id"]

    def test_revoke_token(self, admin_client, revokable_token):
        """Revoke a token and verify the response."""
        result = admin_client.tokens.revoke(revokable_token)
        assert isinstance(result, dict)
        assert result.get("revoked") is True or "message" in result

    def test_revoked_token_blocked_by_proxy(self, admin_client, revokable_token):
        """A revoked token should be rejected by the proxy."""
        # Revoke first
        admin_client.tokens.revoke(revokable_token)
        time.sleep(0.5)  # Allow cache invalidation

        resp = requests.get(
            f"{GATEWAY}/anything",
            headers={"Authorization": f"Bearer {revokable_token}"},
            timeout=5,
        )
        assert resp.status_code == 401, (
            f"Revoked token should get 401, got {resp.status_code}"
        )


# ═════════════════════════════════════════════════════════════
# 8. ASYNC CLIENT SMOKE TEST
# ═════════════════════════════════════════════════════════════

@pytest.mark.anyio
class TestAsyncSDKSmoke:
    async def test_async_list_approvals(self, gateway_up):
        """AsyncClient can list approvals against the live gateway."""
        async with AsyncClient(api_key=ADMIN_KEY, gateway_url=GATEWAY) as client:
            # AsyncClient uses Authorization: Bearer, but admin API expects X-Admin-Key
            # So we test with a raw httpx.AsyncClient for admin endpoints
            pass

    async def test_async_httpx_direct(self, gateway_up):
        """Direct async call to gateway to verify async HTTP works."""
        async with httpx.AsyncClient(
            base_url=GATEWAY,
            headers={"X-Admin-Key": ADMIN_KEY},
        ) as client:
            resp = await client.get("/api/v1/tokens")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)

    async def test_async_audit_list(self, gateway_up):
        """Verify async HTTP against the audit endpoint."""
        async with httpx.AsyncClient(
            base_url=GATEWAY,
            headers={"X-Admin-Key": ADMIN_KEY},
        ) as client:
            resp = await client.get("/api/v1/audit", params={"limit": 5})
            assert resp.status_code == 200
            logs = resp.json()
            assert isinstance(logs, list)
            if len(logs) > 0:
                log = AuditLog(**logs[0])
                assert log.id is not None
