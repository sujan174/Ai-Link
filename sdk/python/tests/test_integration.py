"""
AIlink SDK Integration Tests
============================

Full end-to-end tests against a running Gateway, Postgres, Redis, and Mock Upstream.
Requires `gateway_up` fixture (checks /healthz).

These tests demonstrate the SDK as a developer would use it:
- AIlinkClient.admin()      → Management operations (tokens, credentials, policies)
- AIlinkClient(api_key=...) → Agent proxy operations (forwarding requests)
- Resource methods          → client.tokens.create(), client.approvals.list(), etc.
"""

import pytest
import uuid
import time
import threading
import requests
from ailink import AIlinkClient
from ailink.types import Token, Credential, Policy, AuditLog, ApprovalRequest, Service


# ──────────────────────────────────────────────
# 1. Health & Admin Auth
# ──────────────────────────────────────────────


class TestGatewayHealth:
    def test_healthz(self, gateway_up, gateway_url):
        r = requests.get(f"{gateway_url}/healthz")
        assert r.status_code == 200


class TestAdminAuth:
    def test_invalid_key_returns_401(self, gateway_url):
        """Using a wrong admin key should fail on privileged operations."""
        bad_admin = AIlinkClient.admin(admin_key="wrong_key", gateway_url=gateway_url)
        with pytest.raises(Exception):
            bad_admin.tokens.list()

    def test_valid_admin_key_works(self, admin_client):
        """A properly configured admin client can list tokens."""
        tokens = admin_client.tokens.list()
        assert isinstance(tokens, list)


# ──────────────────────────────────────────────
# 2. Credential Lifecycle
# ──────────────────────────────────────────────


class TestCredentials:
    @pytest.fixture(scope="class")
    def credential(self, admin_client):
        """Create a credential for tests."""
        return admin_client.credentials.create(
            name=f"integ-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test-key",
        )

    def test_create_returns_dict(self, credential):
        """credentials.create() returns a dict with an id."""
        assert credential.get("id") is not None

    def test_list_returns_credential_models(self, admin_client, credential):
        """credentials.list() returns Credential Pydantic models."""
        creds = admin_client.credentials.list()
        assert len(creds) > 0
        assert all(isinstance(c, Credential) for c in creds)

        # Verify our created cred is in the list — attribute access, not dict access
        ids = [c.id for c in creds]
        assert str(credential["id"]) in [str(i) for i in ids]

    def test_credential_has_expected_fields(self, admin_client, credential):
        """Credential models expose name and provider as attributes."""
        creds = admin_client.credentials.list()
        our_cred = next(c for c in creds if str(c.id) == str(credential["id"]))
        assert our_cred.provider == "openai"
        assert our_cred.name.startswith("integ-cred-")


# ──────────────────────────────────────────────
# 3. Token Lifecycle
# ──────────────────────────────────────────────


class TestTokens:
    @pytest.fixture(scope="class")
    def credential(self, admin_client):
        return admin_client.credentials.create(
            name=f"tok-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )

    @pytest.fixture(scope="class")
    def token(self, admin_client, credential, project_id, mock_upstream_url):
        return admin_client.tokens.create(
            name=f"integ-token-{uuid.uuid4().hex[:8]}",
            credential_id=str(credential["id"]),
            upstream_url=f"{mock_upstream_url}/anything",
            project_id=project_id,
        )

    def test_create_returns_dict_with_token_id(self, token):
        """tokens.create() returns dict with ailink_v1_ prefixed token_id."""
        assert "token_id" in token
        assert token["token_id"].startswith("ailink_v1_")

    def test_list_returns_token_models(self, admin_client, token):
        """tokens.list() returns Token Pydantic models with attribute access."""
        tokens = admin_client.tokens.list()
        assert len(tokens) > 0
        assert all(isinstance(t, Token) for t in tokens)

        our_token = next(
            (t for t in tokens if t.name == token["name"]), None
        )
        assert our_token is not None
        assert our_token.is_active is True

    def test_revoke_and_verify(self, admin_client, credential, project_id, mock_upstream_url):
        """Create, revoke, and verify the revoked token is rejected."""
        # Create a disposable token
        tok = admin_client.tokens.create(
            name=f"revoke-test-{uuid.uuid4().hex[:8]}",
            credential_id=str(credential["id"]),
            upstream_url="http://mock-upstream:80/anything",
            project_id=project_id,
        )

        # Revoke it
        result = admin_client.tokens.revoke(tok["token_id"])
        assert result.get("revoked") is True or "message" in result

        # Try to use the revoked token — should fail
        revoked_agent = AIlinkClient(
            api_key=tok["token_id"], gateway_url=admin_client.gateway_url
        )
        resp = revoked_agent.get("/anything")
        assert resp.status_code in (401, 403)


# ──────────────────────────────────────────────
# 4. Policy Lifecycle
# ──────────────────────────────────────────────


class TestPolicies:
    @pytest.fixture(scope="class")
    def policy(self, admin_client):
        """Create a rate-limit policy."""
        return admin_client.policies.create(
            name=f"integ-policy-{uuid.uuid4().hex[:8]}",
            mode="shadow",
            rules=[{
                "when": {"always": True},
                "then": {"action": "rate_limit", "window": "1m", "max_requests": 1000}
            }],
        )

    def test_create_returns_dict_with_id(self, policy):
        """policies.create() returns a dict with an id."""
        assert policy.get("id") is not None

    def test_list_returns_policy_models(self, admin_client, policy):
        """policies.list() returns Policy Pydantic models."""
        policies = admin_client.policies.list()
        assert len(policies) > 0
        assert all(isinstance(p, Policy) for p in policies)

        our_policy = next(
            (p for p in policies if str(p.id) == str(policy["id"])), None
        )
        assert our_policy is not None
        assert our_policy.mode == "shadow"
        # New structure: rules -> then (list) -> action object
        # Assuming dict access driven by the test setup
        rule = our_policy.rules[0]
        # Actions might be deserialized as a list or single object depending on SDK implementation consistency
        # But our input was 'then': {...} which might be normalized to list.
        # Let's check safely.
        action = rule.get("then")
        if isinstance(action, list):
            action = action[0]
        assert action["action"] == "rate_limit"

    def test_update_mode(self, admin_client, policy):
        """policies.update() switches mode from shadow to enforce."""
        result = admin_client.policies.update(str(policy["id"]), mode="enforce")
        assert result is not None

        # Verify the update stuck
        policies = admin_client.policies.list()
        our_policy = next(p for p in policies if str(p.id) == str(policy["id"]))
        assert our_policy.mode == "enforce"

    def test_delete(self, admin_client):
        """policies.delete() soft-deletes a policy."""
        # Create a throwaway policy
        throwaway = admin_client.policies.create(
            name=f"delete-me-{uuid.uuid4().hex[:8]}",
            mode="shadow",
            rules=[],
        )
        result = admin_client.policies.delete(str(throwaway["id"]))
        assert result is not None


# ──────────────────────────────────────────────
# 5. Proxy & Audit
# ──────────────────────────────────────────────


class TestProxyFlow:
    @pytest.fixture(scope="class")
    def active_token(self, admin_client, project_id):
        """Create a credential + token for proxy tests."""
        cred = admin_client.credentials.create(
            name=f"proxy-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"proxy-token-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            project_id=project_id,
        )
        return token_resp["token_id"]

    def test_proxy_roundtrip(self, active_token, gateway_url):
        """Agent sends request through gateway → mock upstream echoes it back."""
        agent = AIlinkClient(api_key=active_token, gateway_url=gateway_url, timeout=10.0)

        resp = agent.post("/anything", json={"hello": "world"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["json"]["hello"] == "world"

    def test_proxy_get(self, active_token, gateway_url):
        """GET request through the proxy."""
        agent = AIlinkClient(api_key=active_token, gateway_url=gateway_url)
        resp = agent.get("/anything/proxy-get-test")
        assert resp.status_code == 200

    def test_audit_logging(self, admin_client, active_token, gateway_url):
        """Requests through the proxy appear in audit logs."""
        marker = f"audit-{uuid.uuid4().hex[:8]}"
        agent = AIlinkClient(api_key=active_token, gateway_url=gateway_url)
        agent.get(f"/anything/{marker}")
        time.sleep(1.5)

        logs = admin_client.audit.list(limit=50)
        assert all(isinstance(log, AuditLog) for log in logs)

        found = any(marker in log.path for log in logs)
        assert found, f"Expected to find audit log with path containing '{marker}'"


# ──────────────────────────────────────────────
# 6. Projects API (raw HTTP — no SDK resource yet)
# ──────────────────────────────────────────────


class TestProjects:
    def test_list_projects(self, admin_client):
        """GET /api/v1/projects returns a list of projects."""
        resp = admin_client.get("/api/v1/projects")
        assert resp.status_code == 200
        projects = resp.json()
        assert isinstance(projects, list)

    def test_create_project(self, admin_client):
        """POST /api/v1/projects creates a new project."""
        resp = admin_client.post(
            "/api/v1/projects",
            json={"name": f"integ-project-{uuid.uuid4().hex[:8]}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert "name" in data


# ──────────────────────────────────────────────
# 7. Analytics Endpoints (raw HTTP — no SDK resource yet)
# ──────────────────────────────────────────────


class TestAnalytics:
    def test_request_volume(self, admin_client, project_id):
        """GET /api/v1/analytics/volume returns 24h volume data."""
        resp = admin_client.get(
            "/api/v1/analytics/volume",
            params={"project_id": project_id},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_status_distribution(self, admin_client, project_id):
        """GET /api/v1/analytics/status returns status code distribution."""
        resp = admin_client.get(
            "/api/v1/analytics/status",
            params={"project_id": project_id},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_latency_percentiles(self, admin_client, project_id):
        """GET /api/v1/analytics/latency returns P50/P90/P99 latency data."""
        resp = admin_client.get(
            "/api/v1/analytics/latency",
            params={"project_id": project_id},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
# ──────────────────────────────────────────────


class TestHITLApprove:
    @pytest.fixture(scope="class")
    def hitl_token(self, admin_client, project_id):
        """Create a token governed by a HITL policy."""
        rules = [{
            "when": {"always": True},
            "then": {"action": "require_approval", "timeout": "10m", "fallback": "deny"}
        }]
        policy = admin_client.policies.create(
            name=f"hitl-approve-{uuid.uuid4().hex[:8]}",
            mode="enforce",
            rules=rules,
        )
        cred = admin_client.credentials.create(
            name=f"hitl-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"hitl-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            project_id=project_id,
            policy_ids=[str(policy["id"])],
        )
        return token_resp["token_id"]

    def test_approve_flow(self, hitl_token, gateway_url, admin_client):
        """Full: agent request blocks → admin approves → request completes 200."""
        agent = AIlinkClient(api_key=hitl_token, gateway_url=gateway_url, timeout=30.0)
        result = {}

        def make_request():
            try:
                resp = agent.get("/anything/hitl-approve")
                result["status"] = resp.status_code
                result["body"] = resp.text[:500]
            except Exception as e:
                result["error"] = str(e)

        t = threading.Thread(target=make_request)
        t.start()
        time.sleep(2.0)

        # Admin finds the pending approval
        pending = admin_client.approvals.list()
        approval_id = None
        for req in pending:
            assert isinstance(req, ApprovalRequest)
            if req.status == "pending" and req.request_summary.path == "/anything/hitl-approve":
                approval_id = req.id
                break

        diag = f"thread_result={result}, pending_count={len(pending)}, pending_paths={[r.request_summary.path for r in pending]}"
        assert approval_id, f"Did not find pending approval for /anything/hitl-approve. Diagnostics: {diag}"

        # Approve it
        decision = admin_client.approvals.approve(str(approval_id))
        assert decision.status == "approved"

        t.join(timeout=15)
        if "error" in result:
            raise result["error"]
        assert result.get("status") == 200


# ──────────────────────────────────────────────
# 7. HITL — Reject Flow
# ──────────────────────────────────────────────


class TestHITLReject:
    @pytest.fixture(scope="class")
    def hitl_token(self, admin_client, project_id):
        """Create a separate token governed by a HITL policy for rejection tests."""
        rules = [{
            "when": {"always": True},
            "then": {"action": "require_approval", "timeout": "10m", "fallback": "deny"}
        }]
        policy = admin_client.policies.create(
            name=f"hitl-reject-{uuid.uuid4().hex[:8]}",
            mode="enforce",
            rules=rules,
        )
        cred = admin_client.credentials.create(
            name=f"hitl-rej-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"hitl-rej-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            project_id=project_id,
            policy_ids=[str(policy["id"])],
        )
        return token_resp["token_id"]

    def test_reject_flow(self, hitl_token, gateway_url, admin_client):
        """Full: agent request blocks → admin rejects → request returns 403."""
        agent = AIlinkClient(api_key=hitl_token, gateway_url=gateway_url, timeout=30.0)
        result = {}

        def make_request():
            try:
                resp = agent.get("/anything/hitl-reject")
                result["status"] = resp.status_code
                result["body"] = resp.text[:500]
            except Exception as e:
                result["error"] = str(e)

        t = threading.Thread(target=make_request)
        t.start()
        time.sleep(2.0)

        # Admin finds the pending approval
        pending = admin_client.approvals.list()
        approval_id = None
        for req in pending:
            assert isinstance(req, ApprovalRequest)
            if req.status == "pending" and req.request_summary.path == "/anything/hitl-reject":
                approval_id = req.id
                break

        diag = f"thread_result={result}, pending_count={len(pending)}, pending_paths={[r.request_summary.path for r in pending]}"
        assert approval_id, f"Did not find pending approval for /anything/hitl-reject. Diagnostics: {diag}"

        # Reject it
        decision = admin_client.approvals.reject(str(approval_id))
        assert decision.status == "rejected"

        t.join(timeout=15)

        # Rejected requests should return 403 (or similar denial)
        assert result.get("status") in (403, 429, 502), \
            f"Expected rejection status, got {result.get('status', result.get('error'))}"


# ──────────────────────────────────────────────
# 8. Resilience & Retry Logic
# ──────────────────────────────────────────────


class TestRetryLogic:
    @pytest.fixture(scope="class")
    def retry_policy(self, admin_client):
        """Create a policy with aggressive retry settings for testing."""
        # Use existing 'rules' structure, but add 'retry' config
        # Python SDK create() accepts **kwargs, so passing retry dict should work
        # provided the backend accepts it (which we verified it does).
        return admin_client.policies.create(
            name=f"retry-policy-{uuid.uuid4().hex[:8]}",
            mode="enforce",
            rules=[{"when": {"always": True}, "then": {"action": "allow"}}],  # Default allow
            retry={
                "max_retries": 2,
                "base_backoff_ms": 1000,
                "max_backoff_ms": 5000,
                "status_codes": [500],
            },
        )

    @pytest.fixture(scope="class")
    def retry_token(self, admin_client, retry_policy, project_id):
        """Create a token governed by the retry policy."""
        cred = admin_client.credentials.create(
            name=f"retry-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"retry-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            project_id=project_id,
            policy_ids=[str(retry_policy["id"])],
        )
        return token_resp["token_id"]

    def test_retry_timing(self, retry_token, gateway_url):
        """
        Request to /status/500 should fail 3 times total (1 initial + 2 retries).
        Backoff:
          Atmpt 1 (fail) -> wait 1.0s (base * 2^0) + jitter
          Atmpt 2 (fail) -> wait 2.0s (base * 2^1) + jitter
          Atmpt 3 (fail) -> return 500
        Total wait: ~3.0s. Verification: > 2.8s.
        """
        agent = AIlinkClient(api_key=retry_token, gateway_url=gateway_url, timeout=10.0)
        
        start_time = time.time()
        # httpbin /status/:code returns that status code
        resp = agent.get("/status/500")
        end_time = time.time()
        
        # It should eventually fail with 500
        assert resp.status_code == 500
        
        duration = end_time - start_time
        # We expect at least 1s + 2s = 3s of sleep.
        # Assert > 2.8s to be safe but firm.
        if duration <= 2.8:
            print(f"\n[FAIL] Duration {duration:.2f}s too short.")
            print(f"Response Status: {resp.status_code}")
            print(f"Response Headers: {resp.headers}")
            print(f"Response Body: {resp.text}")

        assert duration > 2.8, f"Request returned too quickly ({duration:.2f}s); retries likely didn't happen."


# ──────────────────────────────────────────────
# 9. Service Registry (Action Gateway)
# ──────────────────────────────────────────────


class TestServices:
    """Test the Service Registry CRUD lifecycle against a running gateway."""

    @pytest.fixture(scope="class")
    def credential(self, admin_client):
        """Create a credential to link to services."""
        return admin_client.credentials.create(
            name=f"svc-cred-{uuid.uuid4().hex[:8]}",
            provider="generic",
            secret="sk-test-service-key",
        )

    @pytest.fixture(scope="class")
    def service(self, admin_client, credential):
        """Register a test service."""
        return admin_client.services.create(
            name=f"stripe-{uuid.uuid4().hex[:6]}",
            base_url="https://api.stripe.com",
            description="Test Stripe service",
            service_type="generic",
            credential_id=str(credential["id"]),
        )

    def test_create_service_returns_id(self, service):
        """services.create() returns a dict with an id and name."""
        assert service.get("id") is not None
        assert "stripe" in service["name"]
        assert service["base_url"] == "https://api.stripe.com"
        assert service["service_type"] == "generic"

    def test_list_services_returns_models(self, admin_client, service):
        """services.list() returns Service Pydantic models."""
        services = admin_client.services.list()
        assert len(services) > 0
        assert all(isinstance(s, Service) for s in services)

        # Find our created service
        our_svc = next(
            (s for s in services if str(s.id) == str(service["id"])), None
        )
        assert our_svc is not None
        assert our_svc.base_url == "https://api.stripe.com"
        assert our_svc.is_active is True

    def test_service_has_credential_link(self, admin_client, service, credential):
        """Services correctly link to their credential."""
        services = admin_client.services.list()
        our_svc = next(s for s in services if str(s.id) == str(service["id"]))
        assert str(our_svc.credential_id) == str(credential["id"])

    def test_delete_service(self, admin_client, credential):
        """services.delete() removes a service."""
        # Create a throwaway service
        throwaway = admin_client.services.create(
            name=f"delete-me-{uuid.uuid4().hex[:8]}",
            base_url="https://api.example.com",
            credential_id=str(credential["id"]),
        )
        result = admin_client.services.delete(str(throwaway["id"]))
        assert result.get("deleted") is True

        # Verify it's gone from the list
        services = admin_client.services.list()
        ids = [str(s.id) for s in services]
        assert str(throwaway["id"]) not in ids

    def test_create_service_without_credential(self, admin_client):
        """Services can be created without a credential (for public APIs)."""
        svc = admin_client.services.create(
            name=f"public-api-{uuid.uuid4().hex[:8]}",
            base_url="https://api.publicapis.org",
            description="No auth needed",
        )
        assert svc.get("id") is not None
        assert svc["credential_id"] is None

        # Cleanup
        admin_client.services.delete(str(svc["id"]))


class TestServiceProxy:
    """Test proxying requests through a registered service."""

    @pytest.fixture(scope="class")
    def service_proxy_setup(self, admin_client, project_id, mock_upstream_url):
        """
        Create a credential, register a service pointing at mock upstream,
        then create a token for proxying.
        """
        cred = admin_client.credentials.create(
            name=f"svc-proxy-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        svc = admin_client.services.create(
            name=f"mockapi-{uuid.uuid4().hex[:6]}",
            base_url=mock_upstream_url,
            description="Mock upstream for testing",
            service_type="generic",
            credential_id=str(cred["id"]),
        )
        token_resp = admin_client.tokens.create(
            name=f"svc-proxy-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url=mock_upstream_url,  # fallback
            project_id=project_id,
        )
        return {
            "token_id": token_resp["token_id"],
            "service_name": svc["name"],
        }

    def test_proxy_via_service_route(self, service_proxy_setup, gateway_url):
        """
        Agent request to /v1/proxy/services/{name}/anything
        should be proxied to the service's base_url.
        """
        agent = AIlinkClient(
            api_key=service_proxy_setup["token_id"],
            gateway_url=gateway_url,
            timeout=10.0,
        )
        svc_name = service_proxy_setup["service_name"]
        resp = agent.post(
            f"/v1/proxy/services/{svc_name}/anything/service-test",
            json={"test": "service_proxy"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["json"]["test"] == "service_proxy"
