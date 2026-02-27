"""
Security Fixes Integration Tests
=================================

Tests for the security hardening applied to the gateway:
- C1: Auth/scope checks on service, audit, usage, notification handlers
- C2: Project isolation via verify_project_ownership
- C3/H2: SSRF protection on service base_url and policy webhooks
- H3: Constant-time comparison (no length leak)
- H4: No internal error details in responses
- M3: Reserved headers blocked in policy transforms
- M5: Revoked tokens hidden from list_tokens
- M4: Invalid model_pattern regex rejected

Requires running gateway + docker-compose services.
"""

import uuid
import time
import pytest
import requests
from ailink import AIlinkClient


# ──────────────────────────────────────────────
# C1: Missing Auth/Scope Checks
# ──────────────────────────────────────────────


class TestAuthScopeChecks:
    """Verify that privileged endpoints require authentication."""

    def test_list_services_requires_auth(self, gateway_url):
        """GET /api/v1/services should return 401 without auth."""
        resp = requests.get(f"{gateway_url}/api/v1/services", timeout=5)
        assert resp.status_code == 401

    def test_create_service_requires_auth(self, gateway_url):
        """POST /api/v1/services should return 401 without auth."""
        resp = requests.post(
            f"{gateway_url}/api/v1/services",
            json={"name": "test", "base_url": "https://example.com"},
            timeout=5,
        )
        assert resp.status_code == 401

    def test_delete_service_requires_auth(self, gateway_url):
        """DELETE /api/v1/services/:id should return 401 without auth."""
        fake_id = str(uuid.uuid4())
        resp = requests.delete(f"{gateway_url}/api/v1/services/{fake_id}", timeout=5)
        assert resp.status_code == 401

    def test_notifications_require_auth(self, gateway_url):
        """GET /api/v1/notifications should return 401 without auth."""
        resp = requests.get(f"{gateway_url}/api/v1/notifications", timeout=5)
        assert resp.status_code == 401

    def test_notification_count_requires_auth(self, gateway_url):
        """GET /api/v1/notifications/unread should return 401 without auth."""
        resp = requests.get(f"{gateway_url}/api/v1/notifications/unread", timeout=5)
        assert resp.status_code == 401

    def test_token_usage_requires_auth(self, gateway_url):
        """GET /api/v1/tokens/:id/usage should return 401 without auth."""
        fake_id = "ailink_v1_fake"
        resp = requests.get(f"{gateway_url}/api/v1/tokens/{fake_id}/usage", timeout=5)
        assert resp.status_code == 401

    def test_audit_logs_require_auth(self, gateway_url):
        """GET /api/v1/audit should return 401 without auth."""
        resp = requests.get(f"{gateway_url}/api/v1/audit", timeout=5)
        assert resp.status_code == 401

    def test_analytics_requires_auth(self, gateway_url):
        """GET /api/v1/analytics/volume should return 401 without auth."""
        resp = requests.get(f"{gateway_url}/api/v1/analytics/volume", timeout=5)
        assert resp.status_code == 401


# ──────────────────────────────────────────────
# C2: Project Isolation
# ──────────────────────────────────────────────


class TestProjectIsolation:
    """Verify that project_id scoping is enforced — users can't access
    resources belonging to a different org's project."""

    @pytest.fixture(scope="class")
    def setup(self, admin_client):
        """Create a project and a credential for isolation tests."""
        project = admin_client.projects.create(
            name=f"iso-proj-{uuid.uuid4().hex[:6]}"
        )
        cred = admin_client.credentials.create(
            name=f"iso-cred-{uuid.uuid4().hex[:6]}",
            provider="openai",
            secret="sk-test",
        )
        return {"project_id": project["id"], "cred_id": str(cred["id"])}

    def test_list_tokens_with_valid_project(self, admin_client, setup):
        """Listing tokens for a valid project should succeed."""
        tokens = admin_client.tokens.list(project_id=setup["project_id"])
        assert isinstance(tokens, list)

    def test_list_tokens_with_nonexistent_project(self, admin_client):
        """Listing tokens for a random (non-existent) project_id should fail."""
        fake_project_id = str(uuid.uuid4())
        resp = admin_client.get(
            f"/api/v1/tokens?project_id={fake_project_id}"
        )
        # Should be 403 (project isolation) or 404
        assert resp.status_code in (403, 404), (
            f"Expected 403/404 for non-existent project, got {resp.status_code}"
        )


# ──────────────────────────────────────────────
# H2/C3: SSRF Protection
# ──────────────────────────────────────────────


class TestSSRFProtection:
    """Verify SSRF protections on service base_url creation."""

    def test_create_service_blocks_private_ip(self, admin_client):
        """Creating a service with a private IP base_url should fail."""
        resp = admin_client.post(
            "/api/v1/services",
            json={
                "name": f"ssrf-priv-{uuid.uuid4().hex[:6]}",
                "base_url": "http://192.168.1.1:8080",
                "service_type": "generic",
            },
        )
        assert resp.status_code in (400, 422), (
            f"Private IP should be rejected, got {resp.status_code}: {resp.text}"
        )

    def test_create_service_blocks_localhost(self, admin_client):
        """Creating a service with localhost base_url should fail."""
        resp = admin_client.post(
            "/api/v1/services",
            json={
                "name": f"ssrf-local-{uuid.uuid4().hex[:6]}",
                "base_url": "http://127.0.0.1:8080",
                "service_type": "generic",
            },
        )
        assert resp.status_code in (400, 422), (
            f"Localhost should be rejected, got {resp.status_code}: {resp.text}"
        )

    def test_create_service_blocks_metadata_endpoint(self, admin_client):
        """Creating a service with cloud metadata URL should fail."""
        resp = admin_client.post(
            "/api/v1/services",
            json={
                "name": f"ssrf-meta-{uuid.uuid4().hex[:6]}",
                "base_url": "http://169.254.169.254/latest/meta-data",
                "service_type": "generic",
            },
        )
        assert resp.status_code in (400, 422), (
            f"Metadata endpoint should be rejected, got {resp.status_code}: {resp.text}"
        )

    def test_create_service_blocks_non_http_scheme(self, admin_client):
        """Creating a service with ftp:// scheme should fail."""
        resp = admin_client.post(
            "/api/v1/services",
            json={
                "name": f"ssrf-ftp-{uuid.uuid4().hex[:6]}",
                "base_url": "ftp://evil.com/data",
                "service_type": "generic",
            },
        )
        assert resp.status_code in (400, 422), (
            f"Non-HTTP scheme should be rejected, got {resp.status_code}: {resp.text}"
        )

    def test_create_service_allows_public_url(self, admin_client):
        """Creating a service with a public HTTPS URL should succeed."""
        resp = admin_client.post(
            "/api/v1/services",
            json={
                "name": f"ssrf-pub-{uuid.uuid4().hex[:6]}",
                "base_url": "https://api.example.com",
                "service_type": "generic",
            },
        )
        assert resp.status_code in (200, 201), (
            f"Public URL should be accepted, got {resp.status_code}: {resp.text}"
        )


# ──────────────────────────────────────────────
# H4: Error Information Disclosure
# ──────────────────────────────────────────────


class TestErrorDisclosure:
    """Verify that internal error details are not leaked to clients."""

    def test_invalid_policy_returns_generic_error(self, admin_client):
        """Creating a policy with malformed data should return generic error, not stack trace."""
        resp = admin_client.post(
            "/api/v1/policies",
            json={
                "name": f"bad-pol-{uuid.uuid4().hex[:6]}",
                "mode": "enforce",
                "rules": "not_an_array",  # Invalid — should be array
            },
        )
        # Should fail (400 or 422 or 500), but NOT contain internal details
        if resp.status_code >= 400:
            body = resp.text.lower()
            assert "panic" not in body, "Stack trace leaked"
            assert "backtrace" not in body, "Backtrace leaked"
            assert "src/" not in body, "Source path leaked"
        elif resp.status_code in (200, 201):
            # If server accepts it (because validation M2 is deferred),
            # we MUST delete it to avoid breaking list_policies serialization.
            try:
                data = resp.json()
                if "id" in data:
                    admin_client.policies.delete(data["id"])
            except Exception:
                pass  # Best effort cleanup


# ──────────────────────────────────────────────
# M3: Reserved Header Blocking in Transforms
# ──────────────────────────────────────────────


class TestReservedHeaderBlocking:
    """Verify that policy transforms cannot override reserved headers."""

    @pytest.fixture(scope="class")
    def reserved_header_token(self, admin_client, project_id):
        """Create a token with a policy that tries to set the Authorization header."""
        rules = [
            {
                "when": {"always": True},
                "then": {
                    "action": "transform",
                    "operations": [
                        # This should be blocked by the gateway
                        {"type": "set_header", "name": "Authorization", "value": "Bearer HIJACKED"},
                        # This non-reserved header should still work
                        {"type": "set_header", "name": "X-Custom-Test", "value": "allowed"},
                    ]
                }
            }
        ]
        policy = admin_client.policies.create(
            name=f"reserved-hdr-pol-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            rules=rules,
        )
        cred = admin_client.credentials.create(
            name=f"reserved-hdr-cred-{uuid.uuid4().hex[:6]}",
            provider="openai",
            secret="sk-test",
        )
        token = admin_client.tokens.create(
            name=f"reserved-hdr-tok-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            policy_ids=[str(policy["id"])],
        )
        return token["token_id"]

    def test_reserved_header_not_overridden(self, reserved_header_token, gateway_url):
        """The Authorization header should NOT be overridden by the transform."""
        resp = requests.post(
            f"{gateway_url}/anything/reserved-hdr-test",
            headers={
                "Authorization": f"Bearer {reserved_header_token}",
                "Content-Type": "application/json",
            },
            json={"test": "reserved_header"},
            timeout=10,
        )
        assert resp.status_code == 200
        data = resp.json()
        headers = data.get("headers", {})
        # The Authorization header received by upstream should be the original,
        # NOT "Bearer HIJACKED"
        header_keys = {k.lower(): v for k, v in headers.items()}
        auth_val = header_keys.get("authorization", "")
        assert "HIJACKED" not in auth_val, (
            f"Reserved header Authorization was overridden: {auth_val}"
        )
        # Non-reserved custom header should be set
        assert header_keys.get("x-custom-test") == "allowed"


# ──────────────────────────────────────────────
# M4: Model Pattern Regex Validation
# ──────────────────────────────────────────────


class TestModelPatternValidation:
    """Verify that invalid regex patterns are rejected when upserting pricing."""

    def test_invalid_regex_rejected(self, admin_client):
        """An invalid regex in model_pattern should return 422."""
        resp = admin_client.put(
            "/api/v1/pricing",
            json={
                "provider": "test",
                "model_pattern": "[invalid(regex",  # Unclosed bracket
                "input_per_m": 1.0,
                "output_per_m": 2.0,
            },
        )
        assert resp.status_code == 422, (
            f"Invalid regex should be rejected with 422, got {resp.status_code}"
        )

    def test_valid_regex_accepted(self, admin_client):
        """A valid regex in model_pattern should be accepted."""
        resp = admin_client.put(
            "/api/v1/pricing",
            json={
                "provider": "test-sec",
                "model_pattern": "^gpt-4.*",
                "input_per_m": 30.0,
                "output_per_m": 60.0,
            },
        )
        assert resp.status_code in (200, 201), (
            f"Valid regex should be accepted, got {resp.status_code}: {resp.text}"
        )


# ──────────────────────────────────────────────
# M5: Revoked Tokens Filtered From List
# ──────────────────────────────────────────────


class TestRevokedTokenFiltering:
    """Verify that revoked tokens are no longer returned by list_tokens."""

    def test_revoked_token_not_in_list(self, admin_client, project_id, mock_upstream_url):
        """After revoking a token, it should not appear in the token list."""
        cred = admin_client.credentials.create(
            name=f"rev-cred-{uuid.uuid4().hex[:6]}",
            provider="openai",
            secret="sk-test",
        )
        token = admin_client.tokens.create(
            name=f"rev-tok-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            credential_id=str(cred["id"]),
            upstream_url=f"{mock_upstream_url}/anything",
        )
        token_id = token["token_id"]

        # Verify it appears in the list before revocation
        tokens_before = admin_client.tokens.list(project_id=project_id)
        token_ids_before = [t.id for t in tokens_before]
        assert token_id in token_ids_before, "Token should be in list before revocation"

        # Revoke the token
        admin_client.tokens.revoke(token_id)
        time.sleep(0.5)

        # Verify it does NOT appear in the list after revocation
        tokens_after = admin_client.tokens.list(project_id=project_id)
        token_ids_after = [t.id for t in tokens_after]
        assert token_id not in token_ids_after, (
            f"Revoked token {token_id} should NOT appear in list_tokens"
        )
