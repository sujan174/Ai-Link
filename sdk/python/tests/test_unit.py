"""
AIlink SDK Unit Tests
=====================

Mocked tests for AIlinkClient, AsyncClient, and all resource methods.
Does NOT require a running Gateway.

These tests demonstrate the intended SDK usage patterns:
- AIlinkClient(api_key=...) for agent/proxy operations
- AIlinkClient.admin(admin_key=...) for management operations
- client.openai() / client.anthropic() for provider clients
- Resource methods with proper return types
"""

import json
import pytest
import httpx
from unittest.mock import patch, MagicMock
import ailink
from ailink import AIlinkClient, AsyncClient
from ailink.types import Token, Credential, Policy, AuditLog, ApprovalRequest, ApprovalDecision
from ailink.exceptions import AuthenticationError, NotFoundError, GatewayError


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def make_client(**kwargs) -> AIlinkClient:
    """Create a client with a MockTransport."""
    return AIlinkClient(api_key="ailink_v1_test", **kwargs)

def make_admin(**kwargs) -> AIlinkClient:
    """Create an admin client with a MockTransport."""
    return AIlinkClient.admin(admin_key="admin-key", **kwargs)


# ──────────────────────────────────────────────
# 1. Client Initialization
# ──────────────────────────────────────────────


class TestClientInit:
    def test_basic_init(self):
        """Developer creates a client with their virtual token."""
        client = AIlinkClient(api_key="ailink_v1_test_key")
        assert client.api_key == "ailink_v1_test_key"
        assert client.gateway_url == "http://localhost:8443"

    def test_custom_gateway_url(self):
        """Developer points client at a custom gateway."""
        client = AIlinkClient(api_key="key", gateway_url="https://api.custom.com/")
        assert client.gateway_url == "https://api.custom.com"

    def test_admin_factory(self):
        """Admin client is created via the .admin() classmethod."""
        client = AIlinkClient.admin(admin_key="my-admin-key", gateway_url="http://gw:8443")
        assert client.api_key == "my-admin-key"
        assert client.gateway_url == "http://gw:8443"

    def test_agent_name_header(self):
        """Agent name is sent as a custom header."""
        def handler(request):
            assert request.headers.get("X-AIlink-Agent-Name") == "billing-bot"
            return httpx.Response(200, json={"ok": True})

        transport = httpx.MockTransport(handler)
        client = AIlinkClient(api_key="key", agent_name="billing-bot", transport=transport)
        resp = client.get("/test")
        assert resp.status_code == 200

    def test_idempotency_key_header(self):
        """Idempotency key is sent as a custom header."""
        def handler(request):
            assert request.headers.get("X-AIlink-Idempotency-Key") == "unique-key-123"
            return httpx.Response(200, json={"ok": True})

        transport = httpx.MockTransport(handler)
        client = AIlinkClient(api_key="key", idempotency_key="unique-key-123", transport=transport)
        resp = client.get("/test")
        assert resp.status_code == 200

    def test_version_exposed(self):
        """The SDK exposes a __version__ attribute."""
        assert hasattr(ailink, "__version__")
        assert isinstance(ailink.__version__, str)

    def test_repr(self):
        """Client has a useful repr for debugging."""
        client = AIlinkClient(api_key="key", gateway_url="http://gw:8443")
        assert "AIlinkClient" in repr(client)
        assert "http://gw:8443" in repr(client)

    def test_sync_context_manager(self):
        """Sync client supports 'with' for clean resource management."""
        with AIlinkClient(api_key="key") as client:
            assert client.api_key == "key"


# ──────────────────────────────────────────────
# 2. Provider Factories
# ──────────────────────────────────────────────


class TestProviderFactories:
    @patch.dict("sys.modules", {"openai": MagicMock()})
    def test_openai_factory(self):
        """client.openai() returns a configured OpenAI client routing through gateway."""
        import sys
        mock_openai = sys.modules["openai"]
        mock_instance = MagicMock()
        mock_openai.Client.return_value = mock_instance

        client = AIlinkClient(api_key="ailink_v1_abc123")
        result = client.openai()

        mock_openai.Client.assert_called_once_with(
            api_key="ailink_v1_abc123",
            base_url="http://localhost:8443",
            max_retries=0,
        )
        assert result == mock_instance

    @patch.dict("sys.modules", {"anthropic": MagicMock()})
    def test_anthropic_factory(self):
        """client.anthropic() returns a configured Anthropic client with managed key."""
        import sys
        mock_anthropic = sys.modules["anthropic"]
        mock_instance = MagicMock()
        mock_anthropic.Client.return_value = mock_instance

        client = AIlinkClient(api_key="ailink_v1_abc123")
        result = client.anthropic()

        mock_anthropic.Client.assert_called_once_with(
            api_key="AILINK_GATEWAY_MANAGED",
            base_url="http://localhost:8443",
            default_headers={"Authorization": "Bearer ailink_v1_abc123"},
            max_retries=0,
        )
        assert result == mock_instance


# ──────────────────────────────────────────────
# 3. Proxy Methods
# ──────────────────────────────────────────────


class TestProxyMethods:
    def test_get_request(self):
        """Developers use client.get() for proxy requests."""
        def handler(request):
            return httpx.Response(200, json={"message": "ok"})

        client = make_client(transport=httpx.MockTransport(handler))
        resp = client.get("/v1/models")
        assert resp.status_code == 200
        assert resp.json()["message"] == "ok"

    def test_post_request(self):
        """POST requests pass through the gateway transparently."""
        def handler(request):
            data = json.loads(request.read())
            return httpx.Response(200, json={"echo": data})

        client = make_client(transport=httpx.MockTransport(handler))
        resp = client.post("/v1/chat/completions", json={"prompt": "hello"})
        assert resp.status_code == 200
        assert resp.json()["echo"]["prompt"] == "hello"

    def test_put_request(self):
        """PUT requests pass through the gateway."""
        def handler(request):
            return httpx.Response(200, json={"updated": True})

        client = make_client(transport=httpx.MockTransport(handler))
        resp = client.put("/v1/resource/123", json={"name": "new"})
        assert resp.status_code == 200

    def test_delete_request(self):
        """DELETE requests pass through the gateway."""
        def handler(request):
            return httpx.Response(204)

        client = make_client(transport=httpx.MockTransport(handler))
        resp = client.delete("/v1/resource/123")
        assert resp.status_code == 204


# ──────────────────────────────────────────────
# 4. Error Handling
# ──────────────────────────────────────────────


class TestErrorHandling:
    def test_401_raises_authentication_error(self):
        """Gateway returns 401 → AuthenticationError."""
        def handler(request):
            return httpx.Response(401, json={"error": "unauthorized"})

        client = make_admin(transport=httpx.MockTransport(handler))
        with pytest.raises(AuthenticationError) as exc:
            client.tokens.list()
        assert exc.value.status_code == 401
        assert "Authentication failed" in str(exc.value)

    def test_404_raises_not_found_error(self):
        """Gateway returns 404 → NotFoundError."""
        def handler(request):
            return httpx.Response(404, json={"error": "not found"})

        client = make_admin(transport=httpx.MockTransport(handler))
        with pytest.raises(NotFoundError) as exc:
            client.tokens.revoke("nonexistent-token")
        assert exc.value.status_code == 404

    def test_500_raises_gateway_error(self):
        """Gateway 500 errors → GatewayError."""
        def handler(request):
            return httpx.Response(500, json={"error": "internal"})

        client = make_admin(transport=httpx.MockTransport(handler))
        with pytest.raises(GatewayError) as exc:
            client.credentials.list()
        assert exc.value.status_code == 500
        assert "Gateway error" in str(exc.value)


# ──────────────────────────────────────────────
# 5. Tokens Resource
# ──────────────────────────────────────────────


class TestTokensResource:
    def test_list_returns_token_models(self):
        """tokens.list() returns List[Token] Pydantic models."""
        def handler(request):
            assert request.url.path == "/api/v1/tokens"
            return httpx.Response(200, json=[
                {
                    "id": "tok_123",
                    "name": "my-agent-token",
                    "credential_id": "cred_abc",
                    "upstream_url": "https://api.openai.com",
                    "is_active": True,
                    "project_id": "proj_1",
                    "policy_ids": ["pol_1"],
                    "scopes": [],
                }
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        tokens = client.tokens.list()

        assert len(tokens) == 1
        assert isinstance(tokens[0], Token)
        assert tokens[0].name == "my-agent-token"
        assert tokens[0].is_active is True
        assert tokens[0].credential_id == "cred_abc"

    def test_create_returns_dict(self):
        """tokens.create() returns a dict with token_id."""
        def handler(request):
            data = json.loads(request.read())
            assert data["name"] == "new-token"
            assert data["credential_id"] == "cred_abc"
            return httpx.Response(201, json={
                "token_id": "ailink_v1_proj_tok_xyz",
                "name": "new-token",
                "message": "Token created"
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.create(
            name="new-token",
            credential_id="cred_abc",
            upstream_url="https://api.openai.com",
            project_id="proj_1",
        )

        assert result["token_id"].startswith("ailink_v1_")
        assert result["name"] == "new-token"

    def test_revoke(self):
        """tokens.revoke() soft-deletes a token."""
        def handler(request):
            assert "/api/v1/tokens/ailink_v1_tok" in str(request.url)
            return httpx.Response(200, json={"message": "Token revoked"})

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.revoke("ailink_v1_tok")
        assert result["message"] == "Token revoked"


# ──────────────────────────────────────────────
# 6. Credentials Resource
# ──────────────────────────────────────────────


class TestCredentialsResource:
    def test_list_returns_credential_models(self):
        """credentials.list() returns List[Credential] Pydantic models."""
        def handler(request):
            return httpx.Response(200, json=[
                {
                    "id": "cred_abc",
                    "name": "production-openai",
                    "provider": "openai",
                    "created_at": "2026-01-01T00:00:00Z",
                }
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        creds = client.credentials.list()

        assert len(creds) == 1
        assert isinstance(creds[0], Credential)
        assert creds[0].name == "production-openai"
        assert creds[0].provider == "openai"

    def test_create_returns_dict(self):
        """credentials.create() returns a dict with the new credential id."""
        def handler(request):
            data = json.loads(request.read())
            assert data["provider"] == "anthropic"
            assert "secret" in data  # secret is sent but never returned
            return httpx.Response(201, json={
                "id": "cred_new",
                "name": "claude-key",
                "provider": "anthropic",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.credentials.create(
            name="claude-key",
            provider="anthropic",
            secret="sk-ant-secret",
        )

        assert result["id"] == "cred_new"
        # Secret should NOT be in the response
        assert "secret" not in result


# ──────────────────────────────────────────────
# 7. Policies Resource
# ──────────────────────────────────────────────


class TestPoliciesResource:
    def test_list_returns_policy_models(self):
        """policies.list() returns List[Policy] Pydantic models."""
        def handler(request):
            return httpx.Response(200, json=[
                {
                    "id": "pol_1",
                    "name": "rate-limit-100",
                    "mode": "enforce",
                    "rules": [{"type": "rate_limit", "window": "1m", "max_requests": 100}],
                }
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        policies = client.policies.list()

        assert len(policies) == 1
        assert isinstance(policies[0], Policy)
        assert policies[0].name == "rate-limit-100"
        assert policies[0].mode == "enforce"
        assert policies[0].rules[0]["type"] == "rate_limit"

    def test_create_returns_dict(self):
        """policies.create() returns a dict with the new policy id."""
        def handler(request):
            data = json.loads(request.read())
            assert data["name"] == "hitl-policy"
            assert data["mode"] == "enforce"
            assert len(data["rules"]) == 1
            return httpx.Response(201, json={
                "id": "pol_new",
                "name": "hitl-policy",
                "message": "Policy created",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.policies.create(
            name="hitl-policy",
            mode="enforce",
            rules=[{"type": "human_approval", "timeout": "10m", "fallback": "deny"}],
        )

        assert result["id"] == "pol_new"

    def test_update(self):
        """policies.update() partially updates a policy."""
        def handler(request):
            data = json.loads(request.read())
            assert data["mode"] == "shadow"
            return httpx.Response(200, json={"id": "pol_1", "mode": "shadow"})

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.policies.update("pol_1", mode="shadow")
        assert result["mode"] == "shadow"

    def test_delete(self):
        """policies.delete() soft-deletes a policy."""
        def handler(request):
            assert "/api/v1/policies/pol_1" in str(request.url)
            return httpx.Response(200, json={"message": "Policy deleted"})

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.policies.delete("pol_1")
        assert result["message"] == "Policy deleted"


# ──────────────────────────────────────────────
# 8. Audit Resource
# ──────────────────────────────────────────────


class TestAuditResource:
    def test_list_returns_audit_log_models(self):
        """audit.list() returns List[AuditLog] Pydantic models."""
        def handler(request):
            assert "limit=10" in str(request.url)
            return httpx.Response(200, json=[
                {
                    "id": "log_1",
                    "created_at": "2026-01-15T12:00:00Z",
                    "method": "POST",
                    "path": "/v1/chat/completions",
                    "upstream_status": 200,
                    "response_latency_ms": 450,
                    "agent_name": "billing-bot",
                    "policy_result": "allowed",
                    "fields_redacted": ["email"],
                    "shadow_violations": [],
                }
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        logs = client.audit.list(limit=10)

        assert len(logs) == 1
        assert isinstance(logs[0], AuditLog)
        assert logs[0].method == "POST"
        assert logs[0].path == "/v1/chat/completions"
        assert logs[0].upstream_status == 200
        assert logs[0].response_latency_ms == 450
        assert logs[0].agent_name == "billing-bot"
        assert "email" in logs[0].fields_redacted


# ──────────────────────────────────────────────
# 9. Approvals Resource
# ──────────────────────────────────────────────


class TestApprovalsResource:
    def test_list_returns_pydantic_models(self):
        """approvals.list() returns ApprovalRequest objects, not raw dicts."""
        def handler(request):
            return httpx.Response(200, json=[
                {
                    "id": "approval-123",
                    "token_id": "tok_abc",
                    "status": "pending",
                    "request_summary": {"method": "GET", "path": "/foo"},
                    "expires_at": "2026-01-01T00:00:00Z",
                }
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        approvals = client.approvals.list()

        assert len(approvals) == 1
        assert isinstance(approvals[0], ApprovalRequest)
        assert approvals[0].status == "pending"
        assert approvals[0].id == "approval-123"
        assert approvals[0].request_summary.method == "GET"

    def test_approve(self):
        """approvals.approve() sends approved decision and returns ApprovalDecision."""
        def handler(request):
            data = json.loads(request.read())
            assert data["decision"] == "approved"
            assert "/api/v1/approvals/apr_123/decision" in str(request.url)
            return httpx.Response(200, json={
                "id": "apr_123",
                "status": "approved",
                "updated": True,
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.approvals.approve("apr_123")

        assert isinstance(result, ApprovalDecision)
        assert result.status == "approved"
        assert result.updated is True

    def test_reject(self):
        """approvals.reject() sends rejected decision and returns ApprovalDecision."""
        def handler(request):
            data = json.loads(request.read())
            assert data["decision"] == "rejected"
            return httpx.Response(200, json={
                "id": "apr_456",
                "status": "rejected",
                "updated": True,
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.approvals.reject("apr_456")

        assert isinstance(result, ApprovalDecision)
        assert result.status == "rejected"


# ──────────────────────────────────────────────
# 10. Async Client
# ──────────────────────────────────────────────


@pytest.mark.anyio
class TestAsyncClient:
    async def test_async_context_manager(self):
        """AsyncClient supports async with for clean resource management."""
        async with AsyncClient(api_key="key") as client:
            assert client.api_key == "key"

    async def test_async_proxy_request(self):
        """Async client supports get/post for proxy requests."""
        async def handler(request):
            return httpx.Response(200, json={"data": "ok"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            resp = await client.get("/v1/models")
            assert resp.status_code == 200
            assert resp.json()["data"] == "ok"

    async def test_async_tokens_list(self):
        """Async tokens.list() returns Token Pydantic models."""
        async def handler(request):
            return httpx.Response(200, json=[
                {
                    "id": "tok_1",
                    "name": "async-token",
                    "credential_id": "cred_1",
                    "upstream_url": "https://api.openai.com",
                    "is_active": True,
                }
            ])

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            tokens = await client.tokens.list()
            assert len(tokens) == 1
            assert isinstance(tokens[0], Token)
            assert tokens[0].name == "async-token"

    async def test_async_approvals_list(self):
        """Async approvals.list() returns ApprovalRequest Pydantic models."""
        async def handler(request):
            return httpx.Response(200, json=[
                {
                    "id": "approval-456",
                    "token_id": "tok_xyz",
                    "status": "pending",
                    "request_summary": {"method": "POST", "path": "/v1/chat"},
                    "expires_at": "2026-01-01T00:00:00Z",
                }
            ])

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            approvals = await client.approvals.list()
            assert len(approvals) == 1
            assert isinstance(approvals[0], ApprovalRequest)
            assert approvals[0].status == "pending"

    async def test_async_approvals_approve(self):
        """Async approvals.approve() returns ApprovalDecision."""
        async def handler(request):
            return httpx.Response(200, json={
                "id": "apr_789",
                "status": "approved",
                "updated": True,
            })

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            result = await client.approvals.approve("apr_789")
            assert isinstance(result, ApprovalDecision)
            assert result.status == "approved"

    async def test_async_openai_factory(self):
        """AsyncClient.openai() returns an async OpenAI client."""
        with patch("openai.AsyncClient") as MockAsyncClient:
            async with AsyncClient(api_key="key") as client:
                client.openai()
                MockAsyncClient.assert_called_with(
                    api_key="key",
                    base_url="http://localhost:8443",
                    max_retries=0,
                )

    async def test_async_anthropic_factory(self):
        """AsyncClient.anthropic() returns an async Anthropic client."""
        with patch("anthropic.AsyncAnthropic") as MockAsyncAnthropic:
            async with AsyncClient(api_key="key") as client:
                client.anthropic()
                MockAsyncAnthropic.assert_called()
