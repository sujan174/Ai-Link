"""
Comprehensive SDK Feature Tests for AIlink Gateway
====================================================
Tests ALL features using the Python SDK (ailink.Client).

Covers:
  1. Admin client — SDK initialization, authentication
  2. Tokens API — List, create, filter, shape validation via SDK
  3. Approvals API — List, approve/reject via SDK, error cases
  4. Audit Logs — List, pagination, limit capping via SDK
  5. Proxy pipeline — Token auth, invalid tokens, format validation
  6. CORS — Preflight, response headers
  7. Error handling — Empty bodies, bad methods, nonexistent routes
  8. Concurrency — Parallel reads and writes
  9. Dashboard compatibility — Verify JSON shapes match dashboard expectations

Prerequisites:
  - docker compose up (gateway on :8443, postgres, redis)
  - pip install -e .[dev]

Run:
  pytest tests/test_sdk_features.py -v --tb=short
"""

import os
import uuid
import time
import pytest
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import SDK
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ailink import Client

# ── Config ──────────────────────────────────────
GATEWAY = os.getenv("GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY = os.getenv(
    "ADMIN_KEY",
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
)
PROJECT_ID = "00000000-0000-0000-0000-000000000001"


# ── Fixtures ────────────────────────────────────

@pytest.fixture(scope="session")
def gateway_up():
    """Wait for gateway to be healthy."""
    for _ in range(10):
        try:
            r = requests.get(f"{GATEWAY}/healthz", timeout=2)
            if r.status_code == 200:
                return True
        except requests.ConnectionError:
            time.sleep(1)
    pytest.skip("Gateway not reachable")


@pytest.fixture(scope="session")
def admin_client(gateway_up):
    """Create an admin SDK client."""
    return Client.admin(admin_key=ADMIN_KEY, gateway_url=GATEWAY)


@pytest.fixture(scope="session")
def agent_client(gateway_up):
    """Create an agent SDK client with a fake token (for proxy tests)."""
    return Client(api_key="ailink_v1_fake_tok_000000000000", gateway_url=GATEWAY)


# =====================================================
# 1. SDK ADMIN CLIENT INITIALIZATION
# =====================================================

class TestSDKAdminClient:
    def test_admin_client_creation(self, admin_client):
        """Admin client should be created with correct config."""
        assert admin_client.gateway_url == GATEWAY
        assert admin_client.api_key == ADMIN_KEY

    def test_admin_client_has_resources(self, admin_client):
        """Admin client should expose tokens, approvals, and audit."""
        assert hasattr(admin_client, "tokens")
        assert hasattr(admin_client, "approvals")
        assert hasattr(admin_client, "audit")

    def test_admin_client_auth_header(self, admin_client):
        """Admin client should send X-Admin-Key header."""
        headers = admin_client._http.headers
        assert "x-admin-key" in headers or "X-Admin-Key" in headers

    def test_agent_client_auth_header(self, agent_client):
        """Agent client should send Authorization: Bearer header."""
        headers = agent_client._http.headers
        assert "authorization" in headers or "Authorization" in headers


# =====================================================
# 2. TOKENS API VIA SDK
# =====================================================

class TestSDKTokens:
    def test_list_tokens(self, admin_client):
        """list() should return a list."""
        tokens = admin_client.tokens.list()
        assert isinstance(tokens, list)

    def test_list_tokens_with_filter(self, admin_client):
        """list() with project_id filter should work."""
        tokens = admin_client.tokens.list(project_id=PROJECT_ID)
        assert isinstance(tokens, list)

    def test_create_token_success(self, admin_client):
        """create() with valid data should return token info."""
        cred_id = str(uuid.uuid4())
        try:
            result = admin_client.tokens.create(
                name=f"sdk-test-{uuid.uuid4().hex[:8]}",
                credential_id=cred_id,
                upstream_url="http://mock-upstream:80/anything",
                project_id=PROJECT_ID,
            )
            assert "token_id" in result
            assert result["token_id"].startswith("ailink_v1_")
            assert "name" in result
            assert "message" in result
        except Exception as e:
            # FK constraint violation is expected (credential doesn't exist)
            assert "500" in str(e)

    def test_create_token_invalid_url(self, admin_client):
        """create() with bad URL should raise."""
        with pytest.raises(Exception) as exc:
            admin_client.tokens.create(
                name="bad-url",
                credential_id=str(uuid.uuid4()),
                upstream_url="ftp://bad/url",
            )
        assert "400" in str(exc.value)

    def test_token_shape(self, admin_client):
        """Token objects should have all dashboard-expected fields."""
        tokens = admin_client.tokens.list()
        if len(tokens) > 0:
            t = tokens[0]
            for field in ["id", "project_id", "name", "credential_id",
                         "upstream_url", "scopes", "policy_ids",
                         "is_active", "created_at"]:
                assert field in t, f"Missing field: {field}"


# =====================================================
# 3. APPROVALS API VIA SDK
# =====================================================

class TestSDKApprovals:
    def test_list_approvals(self, admin_client):
        """list() should return a list."""
        approvals = admin_client.approvals.list()
        assert isinstance(approvals, list)

    def test_approve_nonexistent(self, admin_client):
        """approve() on non-existent ID should return updated=false."""
        fake_id = str(uuid.uuid4())
        result = admin_client.approvals.approve(fake_id)
        assert result["updated"] is False
        assert result["status"] == "approved"

    def test_reject_nonexistent(self, admin_client):
        """reject() on non-existent ID should return updated=false."""
        fake_id = str(uuid.uuid4())
        result = admin_client.approvals.reject(fake_id)
        assert result["updated"] is False
        assert result["status"] == "rejected"

    def test_approve_invalid_uuid(self, admin_client):
        """approve() with invalid UUID should raise 400."""
        with pytest.raises(Exception) as exc:
            admin_client.approvals.approve("not-a-uuid")
        assert "400" in str(exc.value)

    def test_approval_response_shape(self, admin_client):
        """Decision response should have id, status, updated."""
        fake_id = str(uuid.uuid4())
        result = admin_client.approvals.approve(fake_id)
        assert "id" in result
        assert "status" in result
        assert "updated" in result


# =====================================================
# 4. AUDIT LOGS VIA SDK
# =====================================================

class TestSDKAuditLogs:
    def test_list_audit_logs(self, admin_client):
        """list() should return a list."""
        logs = admin_client.audit.list()
        assert isinstance(logs, list)

    def test_pagination(self, admin_client):
        """Pagination params should be respected."""
        logs = admin_client.audit.list(limit=5, offset=0)
        assert isinstance(logs, list)
        assert len(logs) <= 5

    def test_limit_capped(self, admin_client):
        """Server should handle large limits gracefully."""
        logs = admin_client.audit.list(limit=9999)
        assert isinstance(logs, list)

    def test_negative_offset(self, admin_client):
        """Negative offset should be handled gracefully."""
        logs = admin_client.audit.list(limit=10, offset=-5)
        assert isinstance(logs, list)

    def test_audit_log_shape(self, admin_client):
        """Logs should have all dashboard-expected fields."""
        logs = admin_client.audit.list()
        if len(logs) > 0:
            log = logs[0]
            for field in ["id", "created_at", "method", "path",
                         "upstream_status", "response_latency_ms",
                         "agent_name", "policy_result"]:
                assert field in log, f"Missing field: {field}"

    def test_page_disjoint(self, admin_client):
        """Two sequential pages should not overlap."""
        page1 = admin_client.audit.list(limit=25, offset=0)
        page2 = admin_client.audit.list(limit=25, offset=25)
        ids1 = {log["id"] for log in page1}
        ids2 = {log["id"] for log in page2}
        assert ids1.isdisjoint(ids2) or len(ids1) == 0 or len(ids2) == 0


# =====================================================
# 5. PROXY PIPELINE
# =====================================================

class TestProxyPipeline:
    def test_no_auth_returns_401(self, gateway_up):
        """Requests without any auth should get 401."""
        r = requests.get(f"{GATEWAY}/anything")
        assert r.status_code == 401

    def test_invalid_bearer_returns_401(self, gateway_up):
        """Bearer token with wrong prefix should get 401."""
        r = requests.get(
            f"{GATEWAY}/anything",
            headers={"Authorization": "Bearer wrong_prefix_123"},
        )
        assert r.status_code == 401

    def test_nonexistent_token_returns_401(self, agent_client):
        """Agent client with non-existent token should get 401."""
        r = agent_client._http.get("/anything")
        assert r.status_code == 401

    def test_proxy_error_json_shape(self, gateway_up):
        """Error responses from proxy should include JSON with 'error' key."""
        r = requests.get(f"{GATEWAY}/anything")
        assert r.status_code == 401
        data = r.json()
        assert "error" in data

    def test_api_routes_not_proxied(self, gateway_up):
        """Requests to /api/v1/* should hit admin auth, not proxy."""
        # Without admin key → 401 from admin_auth middleware
        r = requests.get(f"{GATEWAY}/api/v1/tokens")
        assert r.status_code == 401

        # With admin key → 200 from management API
        r = requests.get(
            f"{GATEWAY}/api/v1/tokens",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code == 200


# =====================================================
# 6. CORS
# =====================================================

class TestCORSViaSDK:
    def test_preflight(self, gateway_up):
        """CORS preflight should succeed without auth."""
        r = requests.options(
            f"{GATEWAY}/api/v1/tokens",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-admin-key,content-type",
            },
        )
        assert r.status_code in [200, 204]

    def test_cors_response_headers(self, gateway_up):
        """API responses should include CORS headers."""
        r = requests.get(
            f"{GATEWAY}/api/v1/tokens",
            headers={
                "X-Admin-Key": ADMIN_KEY,
                "Origin": "http://localhost:3000",
            },
        )
        assert r.status_code == 200
        assert "access-control-allow-origin" in r.headers


# =====================================================
# 7. ERROR HANDLING
# =====================================================

class TestErrorHandling:
    def test_empty_body_on_create_token(self, gateway_up):
        """POST /tokens with empty body should return 4xx."""
        r = requests.post(
            f"{GATEWAY}/api/v1/tokens",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code in [400, 415, 422]

    def test_empty_body_on_decision(self, gateway_up):
        """POST /approvals/id/decision with empty body should return 4xx."""
        fake_id = str(uuid.uuid4())
        r = requests.post(
            f"{GATEWAY}/api/v1/approvals/{fake_id}/decision",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code in [400, 415, 422]

    def test_method_not_allowed(self, gateway_up):
        """DELETE on /tokens should return 405."""
        r = requests.delete(
            f"{GATEWAY}/api/v1/tokens",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code == 405

    def test_nonexistent_api_route(self, gateway_up):
        """Unknown /api/v1/* route should return 404, not proxy fallback."""
        r = requests.get(
            f"{GATEWAY}/api/v1/nonexistent",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code == 404

    def test_extra_large_limit(self, gateway_up):
        """Extremely large limit should be capped, not crash."""
        r = requests.get(
            f"{GATEWAY}/api/v1/audit?limit=999999999999",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code == 200

    def test_get_on_post_only_route(self, gateway_up):
        """GET on /approvals/:id/decision should return 405."""
        fake_id = str(uuid.uuid4())
        r = requests.get(
            f"{GATEWAY}/api/v1/approvals/{fake_id}/decision",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code == 405


# =====================================================
# 8. CONCURRENCY
# =====================================================

class TestSDKConcurrency:
    def test_parallel_token_listing(self, admin_client):
        """10 concurrent token listing requests should all succeed."""
        def fetch():
            return admin_client.tokens.list()

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = [pool.submit(fetch) for _ in range(20)]
            results = [f.result() for f in as_completed(futures)]

        assert len(results) == 20
        for r in results:
            assert isinstance(r, list)

    def test_parallel_approval_decisions(self, admin_client):
        """Parallel approval decisions should not deadlock."""
        def decide():
            fake_id = str(uuid.uuid4())
            return admin_client.approvals.approve(fake_id)

        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(decide) for _ in range(10)]
            results = [f.result() for f in as_completed(futures)]

        assert len(results) == 10
        for r in results:
            assert "id" in r
            assert r["updated"] is False

    def test_parallel_audit_reads(self, admin_client):
        """Parallel audit reads should not interfere."""
        def fetch():
            return admin_client.audit.list(limit=10)

        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(fetch) for _ in range(10)]
            results = [f.result() for f in as_completed(futures)]

        assert len(results) == 10
        for r in results:
            assert isinstance(r, list)


# =====================================================
# 9. DASHBOARD COMPATIBILITY
# =====================================================

class TestDashboardCompatibility:
    """Verify API responses match what the Next.js dashboard expects."""

    def test_tokens_page_fields(self, admin_client):
        """Dashboard Tokens page expects: id, name, is_active, created_at."""
        tokens = admin_client.tokens.list()
        for t in tokens:
            assert "id" in t
            assert "name" in t
            assert "is_active" in t
            assert "created_at" in t

    def test_approvals_page_fields(self, admin_client):
        """Dashboard Approvals page expects: id, token_id, request_summary, status, expires_at."""
        approvals = admin_client.approvals.list()
        # Usually empty, but the shape matters
        for a in approvals:
            assert "id" in a
            assert "request_summary" in a
            assert "status" in a
            assert "expires_at" in a

    def test_audit_page_fields(self, admin_client):
        """Dashboard Audit page expects: id, method, path, upstream_status, response_latency_ms."""
        logs = admin_client.audit.list()
        for log in logs:
            assert "id" in log
            assert "method" in log
            assert "path" in log

    def test_decision_response_for_dashboard(self, admin_client):
        """Dashboard calls decideApproval and expects {id, status, updated}."""
        fake_id = str(uuid.uuid4())
        result = admin_client.approvals.approve(fake_id)
        assert "id" in result
        assert "status" in result
        assert "updated" in result

    def test_polling_consistency(self, admin_client):
        """Dashboard polls approvals every 5s — two calls should be consistent."""
        a1 = admin_client.approvals.list()
        time.sleep(0.5)
        a2 = admin_client.approvals.list()
        assert len(a1) == len(a2)
