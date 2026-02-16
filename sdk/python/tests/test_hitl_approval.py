"""
End-to-end tests for the Human-in-the-Loop (HITL) approval system.

Tests the full flow:
  Proxy request → policy triggers HITL → approval created →
  admin approves/rejects → proxy continues or returns error.

Requires:
  - Gateway running at GATEWAY_URL (default: http://localhost:8443)
  - PostgreSQL accessible via docker exec
  - A credential already seeded in the DB
"""
import json
import os
import subprocess
import threading
import time
import uuid

import httpx
import pytest

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY = os.getenv("ADMIN_KEY", "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
PROJECT_ID = "00000000-0000-0000-0000-000000000001"


# ── DB helpers (via docker exec psql) ────────────────────────────

def run_sql(sql: str) -> str:
    """Execute SQL against the Postgres container and return stdout."""
    result = subprocess.run(
        [
            "docker", "exec",
            subprocess.check_output(
                ["docker", "ps", "-qf", "name=postgres"], text=True
            ).strip(),
            "psql", "-U", "postgres", "-d", "ailink",
            "-t", "-A",  # tuple-only, unaligned output
            "-c", sql,
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SQL failed: {result.stderr}")
    return result.stdout.strip()


# ── HTTP helpers ──────────────────────────────────────────────────

def admin_client() -> httpx.Client:
    return httpx.Client(
        base_url=GATEWAY_URL,
        headers={"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"},
        timeout=35,  # longer than the 30s HITL polling window
    )


def proxy_get(token_id: str, path: str = "/test-hitl", timeout: float = 35) -> httpx.Response:
    """Make a proxied GET request through the gateway."""
    with httpx.Client(base_url=GATEWAY_URL, timeout=timeout) as c:
        return c.get(path, headers={"Authorization": f"Bearer {token_id}"})


# ── Fixtures ──────────────────────────────────────────────────────

POLICY_ID = None
HITL_TOKEN_ID = None


@pytest.fixture(scope="module", autouse=True)
def setup_hitl_fixtures():
    """Insert a HITL policy via SQL and create a token linked to it via API."""
    global POLICY_ID, HITL_TOKEN_ID

    # 1. Get the existing credential ID
    cred_id = run_sql("SELECT id FROM credentials LIMIT 1;")
    assert cred_id, "No credential found in DB — seed one first"

    # 2. Insert a HITL policy
    policy_uuid = str(uuid.uuid4())
    rules_json = json.dumps([
        {"type": "human_approval", "timeout": "10m", "fallback": "deny"}
    ])
    run_sql(
        f"INSERT INTO policies (id, project_id, name, mode, rules) "
        f"VALUES ('{policy_uuid}', '{PROJECT_ID}', 'hitl-test-policy', 'enforce', '{rules_json}') "
        f"ON CONFLICT (project_id, name) DO UPDATE SET rules = EXCLUDED.rules, id = EXCLUDED.id "
        f"RETURNING id;"
    )
    POLICY_ID = policy_uuid

    # 3. Create a token with that policy via the Management API
    with admin_client() as ac:
        resp = ac.post("/api/v1/tokens", json={
            "name": "hitl-test-token",
            "credential_id": cred_id,
            "upstream_url": "http://mock-upstream:80/anything",
            "project_id": PROJECT_ID,
            "policy_ids": [policy_uuid],
        })
        assert resp.status_code == 201, f"Token creation failed: {resp.status_code} {resp.text}"
        HITL_TOKEN_ID = resp.json()["token_id"]

    yield  # ── Run tests ──

    # Cleanup: remove test fixtures
    if HITL_TOKEN_ID:
        run_sql(f"DELETE FROM audit_logs WHERE token_id = '{HITL_TOKEN_ID}';")
        run_sql(f"DELETE FROM approval_requests WHERE token_id = '{HITL_TOKEN_ID}';")
        run_sql(f"DELETE FROM tokens WHERE id = '{HITL_TOKEN_ID}';")
    if POLICY_ID:
        run_sql(f"DELETE FROM policies WHERE id = '{POLICY_ID}';")


# ── Tests ─────────────────────────────────────────────────────────

class TestHITLApproveFlow:
    """Test: proxy request → approval created → approve → 200."""

    def test_approve_allows_request(self):
        """Fire a proxy request in a background thread, approve it, verify 200."""
        result = {"response": None, "error": None}

        def proxy_call():
            try:
                result["response"] = proxy_get(HITL_TOKEN_ID, "/test-hitl-approve")
            except Exception as e:
                result["error"] = e

        # Start proxy request (will block waiting for approval)
        t = threading.Thread(target=proxy_call)
        t.start()
        time.sleep(2)  # Let the approval request get created

        # Find the pending approval
        with admin_client() as ac:
            approvals = ac.get(f"/api/v1/approvals?project_id={PROJECT_ID}").json()
            pending = [a for a in approvals if a["status"] == "pending"]
            assert len(pending) >= 1, f"Expected at least 1 pending approval, got {len(pending)}: {approvals}"

            approval_id = pending[0]["id"]

            # Approve it
            decision_resp = ac.post(
                f"/api/v1/approvals/{approval_id}/decision",
                json={"decision": "approved"},
            )
            assert decision_resp.status_code == 200
            assert decision_resp.json()["status"] == "approved"
            assert decision_resp.json()["updated"] is True

        # Wait for the proxy request to complete
        t.join(timeout=30)
        assert not t.is_alive(), "Proxy thread still alive — request didn't unblock"
        assert result["error"] is None, f"Proxy request errored: {result['error']}"
        assert result["response"] is not None
        assert result["response"].status_code == 200, (
            f"Expected 200 after approval, got {result['response'].status_code}: "
            f"{result['response'].text}"
        )

    def test_approval_leaves_pending_list(self):
        """After approval, it should no longer be in the pending list."""
        with admin_client() as ac:
            approvals = ac.get(f"/api/v1/approvals?project_id={PROJECT_ID}").json()
            # The approval from the previous test should not be pending anymore
            pending_hitl = [
                a for a in approvals
                if a.get("token_id") == HITL_TOKEN_ID and a["status"] == "pending"
            ]
            assert len(pending_hitl) == 0, (
                f"Expected 0 pending HITL approvals, got {len(pending_hitl)}"
            )


class TestHITLRejectFlow:
    """Test: proxy request → approval created → reject → 403."""

    def test_reject_blocks_request(self):
        """Fire a proxy request, reject it, verify proxy returns 403."""
        result = {"response": None, "error": None}

        def proxy_call():
            try:
                result["response"] = proxy_get(HITL_TOKEN_ID, "/test-hitl-reject")
            except Exception as e:
                result["error"] = e

        t = threading.Thread(target=proxy_call)
        t.start()
        time.sleep(2)

        with admin_client() as ac:
            approvals = ac.get(f"/api/v1/approvals?project_id={PROJECT_ID}").json()
            pending = [a for a in approvals if a["status"] == "pending"]
            assert len(pending) >= 1, f"Expected pending approval, got {approvals}"

            approval_id = pending[0]["id"]

            decision_resp = ac.post(
                f"/api/v1/approvals/{approval_id}/decision",
                json={"decision": "rejected"},
            )
            assert decision_resp.status_code == 200
            assert decision_resp.json()["status"] == "rejected"

        t.join(timeout=30)
        assert not t.is_alive()
        assert result["error"] is None, f"Proxy request errored: {result['error']}"
        assert result["response"] is not None
        # Rejected requests should get 403 Forbidden
        assert result["response"].status_code == 403, (
            f"Expected 403 after rejection, got {result['response'].status_code}: "
            f"{result['response'].text}"
        )


class TestHITLPendingVisibility:
    """Test that pending approvals are visible and have correct shape."""

    def test_pending_approval_shape(self):
        """Create a proxy request, verify the pending approval has correct fields."""
        result = {"response": None, "error": None}

        def proxy_call():
            try:
                result["response"] = proxy_get(HITL_TOKEN_ID, "/test-hitl-shape")
            except Exception as e:
                result["error"] = e

        t = threading.Thread(target=proxy_call)
        t.start()
        time.sleep(2)

        with admin_client() as ac:
            approvals = ac.get(f"/api/v1/approvals?project_id={PROJECT_ID}").json()
            pending = [a for a in approvals if a["status"] == "pending"]
            assert len(pending) >= 1

            approval = pending[0]

            # Verify shape matches dashboard expectations
            assert "id" in approval
            assert "token_id" in approval
            assert "project_id" in approval
            assert "request_summary" in approval
            assert "status" in approval
            assert approval["status"] == "pending"
            assert "expires_at" in approval
            assert "created_at" in approval

            # request_summary should have method, path, upstream info
            summary = approval["request_summary"]
            assert "method" in summary
            assert "path" in summary

            # Approve it to unblock the proxy thread
            ac.post(
                f"/api/v1/approvals/{approval['id']}/decision",
                json={"decision": "approved"},
            )

        t.join(timeout=30)

    def test_dashboard_decision_response_shape(self):
        """Verify the decision response has the shape the dashboard expects."""
        result = {"response": None}

        def proxy_call():
            try:
                result["response"] = proxy_get(HITL_TOKEN_ID, "/test-hitl-decision-shape")
            except Exception:
                pass

        t = threading.Thread(target=proxy_call)
        t.start()
        time.sleep(2)

        with admin_client() as ac:
            approvals = ac.get(f"/api/v1/approvals?project_id={PROJECT_ID}").json()
            pending = [a for a in approvals if a["status"] == "pending"]
            assert len(pending) >= 1

            decision_resp = ac.post(
                f"/api/v1/approvals/{pending[0]['id']}/decision",
                json={"decision": "approved"},
            )
            data = decision_resp.json()
            assert "id" in data
            assert "status" in data
            assert "updated" in data
            assert data["status"] in ("approved", "rejected")
            assert isinstance(data["updated"], bool)

        t.join(timeout=30)


class TestHITLAuditLogging:
    """Verify HITL decisions show up in audit logs."""

    def test_approved_request_logged(self):
        """An approved HITL request should appear in audit logs."""
        with admin_client() as ac:
            logs = ac.get(f"/api/v1/audit?project_id={PROJECT_ID}&limit=50").json()
            hitl_logs = [
                l for l in logs
                if l.get("token_id") == HITL_TOKEN_ID
            ]
            # Should have at least one entry from previous approved tests
            assert len(hitl_logs) >= 1, (
                f"Expected HITL audit logs for token {HITL_TOKEN_ID}, got {len(hitl_logs)}"
            )
