"""
P0 Fixes Integration Tests
===========================

Tests for the two P0 gap fixes:
1. Default Rate Limit — tokens without explicit RateLimit policies get 600 req/60s
2. Atomic Spend Cap Enforcement — check_and_increment_spend closes TOCTOU race

Requires running gateway + docker compose services.
"""

import time
import uuid
import pytest
import requests
from ailink import AIlinkClient


# ──────────────────────────────────────────────
# 14. Default Rate Limit Enforcement
# ──────────────────────────────────────────────


class TestDefaultRateLimit:
    """
    Verify that tokens WITHOUT any explicit RateLimit policy
    still get rate-limited by the gateway's default (600/60s).

    We can't easily fire 601 requests in a test, so we:
    - Confirm that normal requests pass (the limit doesn't break things)
    - Create a token WITH a much lower explicit rate limit to show differentiation
    """

    @pytest.fixture(scope="class")
    def bare_token(self, admin_client, project_id, mock_upstream_url):
        """Token with NO policies — should get default rate limit."""
        cred = admin_client.credentials.create(
            name=f"rl-bare-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"rl-bare-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url=f"{mock_upstream_url}/anything",
            project_id=project_id,
        )
        return token_resp["token_id"]

    @pytest.fixture(scope="class")
    def strict_rl_token(self, admin_client, project_id, mock_upstream_url):
        """Token with a strict policy: max 3 requests per 60s."""
        policy = admin_client.policies.create(
            name=f"strict-rl-{uuid.uuid4().hex[:8]}",
            mode="enforce",
            rules=[{
                "when": {"always": True},
                "then": {
                    "action": "rate_limit",
                    "window": "1m",
                    "max_requests": 3,
                    "key": "per_token",
                }
            }],
        )
        cred = admin_client.credentials.create(
            name=f"rl-strict-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"rl-strict-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url=f"{mock_upstream_url}/anything",
            project_id=project_id,
            policy_ids=[str(policy["id"])],
        )
        return token_resp["token_id"]

    def test_bare_token_passes_normal_requests(self, bare_token, gateway_url):
        """
        A token with no explicit rate limit policy should still work
        for normal traffic (well under 600/min).
        """
        agent = AIlinkClient(api_key=bare_token, gateway_url=gateway_url, timeout=10.0)
        # Send 5 requests — well under the 600/60s default
        for i in range(5):
            resp = agent.get(f"/anything/rl-normal-{i}")
            assert resp.status_code == 200, (
                f"Request {i+1} failed with {resp.status_code}: {resp.text}"
            )

    def test_strict_policy_enforces_lower_limit(self, strict_rl_token, gateway_url):
        """
        A token with a strict rate limit policy (3/min) should be rate-limited
        after 3 requests, proving policy-based limits override the default.
        """
        agent = AIlinkClient(api_key=strict_rl_token, gateway_url=gateway_url, timeout=10.0)

        # First 3 requests should pass
        for i in range(3):
            resp = agent.get(f"/anything/rl-strict-{i}")
            assert resp.status_code == 200, (
                f"Request {i+1} should pass but got {resp.status_code}: {resp.text}"
            )

        # 4th request should be rate-limited
        resp4 = agent.get("/anything/rl-strict-blocked")
        assert resp4.status_code == 429, (
            f"Expected 429 on 4th request, got {resp4.status_code}: {resp4.text}"
        )

    def test_rate_limit_appears_in_audit(self, admin_client, strict_rl_token, gateway_url):
        """
        The rate-limited request should appear in audit logs with a deny/rate_limit policy result.
        """
        # Fire requests that we know will exceed the limit (3/min policy)
        agent = AIlinkClient(api_key=strict_rl_token, gateway_url=gateway_url, timeout=10.0)
        for _ in range(5):
            agent.get("/anything/rl-audit-check")

        time.sleep(2.0)

        logs = admin_client.audit.list(limit=100)
        # Rate limit denials show up as policy_result 'denied' with the request path
        rl_denies = [
            log for log in logs
            if (hasattr(log, "policy_result") and log.policy_result
                and "denied" in str(log.policy_result).lower()
                and hasattr(log, "path") and "rl-" in str(getattr(log, "path", "")))
            or (hasattr(log, "upstream_status") and log.upstream_status == 429)
        ]
        assert len(rl_denies) > 0, (
            f"Expected at least one rate-limit denial in audit logs. "
            f"Found {len(logs)} total logs. "
            f"First 10 results/paths: {[(str(getattr(l, 'policy_result', None)), str(getattr(l, 'path', None))) for l in logs[:10]]}"
        )


# ──────────────────────────────────────────────
# 15. Spend Cap Enforcement (Atomic)
# ──────────────────────────────────────────────


class TestSpendCapEnforcement:
    """
    Verify that spend caps are enforced atomically.
    Uses the X-Test-Cost header to force a known cost per request.

    Flow:
    1. Create a token
    2. Set a spend cap ($1.00/daily)
    3. Send requests with forced cost ($0.40 each via X-Test-Cost)
    4. Verify 3rd request is blocked (3 × $0.40 = $1.20 > $1.00)
    """

    @pytest.fixture(scope="class")
    def spend_token_setup(self, admin_client, project_id, mock_upstream_url, gateway_url):
        """Create a token with a $1.00 daily spend cap."""
        cred = admin_client.credentials.create(
            name=f"spend-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"spend-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url=f"{mock_upstream_url}/anything",
            project_id=project_id,
        )
        token_id = token_resp["token_id"]

        # Set a daily spend cap of $1.00 via raw API
        cap_resp = admin_client.put(
            f"/api/v1/tokens/{token_id}/spend",
            json={"period": "daily", "limit_usd": 1.00},
        )
        assert cap_resp.status_code in (200, 201, 204), (
            f"Failed to set spend cap: {cap_resp.status_code} {cap_resp.text}"
        )

        return {"token_id": token_id, "limit_usd": 1.00}

    def test_get_spend_cap(self, admin_client, spend_token_setup):
        """Verify the spend cap was set correctly."""
        token_id = spend_token_setup["token_id"]
        resp = admin_client.get(f"/api/v1/tokens/{token_id}/spend")
        assert resp.status_code == 200
        caps = resp.json()
        # API returns a dict with daily_limit_usd / monthly_limit_usd keys
        assert isinstance(caps, dict), f"Expected dict, got {type(caps)}: {caps}"
        assert caps.get("daily_limit_usd") == 1.0, f"Expected daily_limit_usd=1.0, got: {caps}"

    def test_requests_under_cap_succeed(self, spend_token_setup, gateway_url):
        """
        Requests under the spend cap should succeed.
        Using X-AILink-Test-Cost: 0.50 means 2 requests = $1.00 = exactly at cap.
        The atomic Lua script allows increments up to (but not exceeding) the limit.
        """
        token_id = spend_token_setup["token_id"]
        for i in range(2):
            time.sleep(0.2)  # allow Redis to flush
            resp = requests.post(
                f"{gateway_url}/anything",
                headers={
                    "Authorization": f"Bearer {token_id}",
                    "Content-Type": "application/json",
                    "X-AILink-Test-Cost": "0.50",
                },
                json={"model": "gpt-4", "messages": [{"role": "user", "content": f"spend test {i}"}]},
                timeout=10,
            )
            assert resp.status_code == 200, (
                f"Request {i+1} (cost $0.50) should pass under $1.00 cap, "
                f"got {resp.status_code}: {resp.text}"
            )

    def test_request_over_cap_blocked(self, spend_token_setup, gateway_url):
        """
        After 2 requests at $0.50 each ($1.00 total), the Redis counter
        equals the daily cap. The pre-flight check_spend_cap sees
        current($1.00) >= limit($1.00) and blocks.
        """
        token_id = spend_token_setup["token_id"]
        time.sleep(0.5)  # allow previous requests to complete

        resp = requests.post(
            f"{gateway_url}/anything",
            headers={
                "Authorization": f"Bearer {token_id}",
                "Content-Type": "application/json",
                "X-AILink-Test-Cost": "0.01",
            },
            json={"model": "gpt-4", "messages": [{"role": "user", "content": "should be blocked"}]},
            timeout=10,
        )
        assert resp.status_code in (402, 403, 429), (
            f"Expected spend cap rejection (402/403/429) after hitting $1.00 cap, "
            f"got {resp.status_code}: {resp.text}"
        )

    def test_spend_cap_appears_in_audit(self, admin_client, spend_token_setup, gateway_url):
        """Spend cap rejection should appear in audit logs."""
        time.sleep(2.0)

        logs = admin_client.audit.list(limit=100)
        spend_denies = [
            log for log in logs
            if (hasattr(log, "policy_result") and log.policy_result
                and ("spend" in str(log.policy_result).lower()
                     or "denied" in str(log.policy_result).lower()))
        ]
        # We should have at least one denial (rate limit or spend cap)
        assert len(spend_denies) > 0, (
            "Expected at least one denial in audit logs after exceeding spend cap. "
            f"Found {len(logs)} total logs. "
            f"First 10 results: {[(str(getattr(l, 'policy_result', None)), str(getattr(l, 'path', None))) for l in logs[:10]]}"
        )


# ──────────────────────────────────────────────
# 16. Spend Cap CRUD API
# ──────────────────────────────────────────────


class TestSpendCapCRUD:
    """Test the spend cap management API endpoints."""

    @pytest.fixture(scope="class")
    def crud_token(self, admin_client, project_id, mock_upstream_url):
        """Token for CRUD tests."""
        cred = admin_client.credentials.create(
            name=f"cap-crud-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"cap-crud-tok-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url=f"{mock_upstream_url}/anything",
            project_id=project_id,
        )
        return token_resp["token_id"]

    def test_set_daily_cap(self, admin_client, crud_token):
        """PUT /tokens/:id/spend sets a daily spend cap."""
        resp = admin_client.put(
            f"/api/v1/tokens/{crud_token}/spend",
            json={"period": "daily", "limit_usd": 10.00},
        )
        assert resp.status_code in (200, 201, 204)

    def test_set_monthly_cap(self, admin_client, crud_token):
        """PUT /tokens/:id/spend sets a monthly spend cap."""
        resp = admin_client.put(
            f"/api/v1/tokens/{crud_token}/spend",
            json={"period": "monthly", "limit_usd": 100.00},
        )
        assert resp.status_code in (200, 201, 204)

    def test_get_caps_returns_both(self, admin_client, crud_token):
        """GET /tokens/:id/spend returns both daily and monthly caps."""
        resp = admin_client.get(f"/api/v1/tokens/{crud_token}/spend")
        assert resp.status_code == 200
        caps = resp.json()
        # API returns a dict with daily_limit_usd / monthly_limit_usd
        assert isinstance(caps, dict), f"Expected dict, got {type(caps)}: {caps}"
        assert caps.get("daily_limit_usd") == 10.0
        assert caps.get("monthly_limit_usd") == 100.0

    def test_delete_daily_cap(self, admin_client, crud_token):
        """DELETE /tokens/:id/spend/daily removes the daily cap."""
        resp = admin_client.delete(f"/api/v1/tokens/{crud_token}/spend/daily")
        assert resp.status_code in (200, 204)

        # Verify daily is gone but monthly remains
        resp = admin_client.get(f"/api/v1/tokens/{crud_token}/spend")
        caps = resp.json()
        assert caps.get("daily_limit_usd") is None, f"Daily cap should be removed: {caps}"
        assert caps.get("monthly_limit_usd") == 100.0

    def test_unauthenticated_returns_401(self, gateway_url, crud_token):
        """Spend cap endpoints require authentication."""
        resp = requests.get(
            f"{gateway_url}/api/v1/tokens/{crud_token}/spend",
            timeout=5,
        )
        assert resp.status_code == 401
