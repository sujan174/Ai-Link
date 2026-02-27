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
from ailink.types import Token, Credential, Policy, AuditLog, ApprovalRequest, ApprovalDecision, Service
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
            default_headers=None,
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

    def test_create_with_circuit_breaker_disabled(self):
        """tokens.create() passes circuit_breaker config to the gateway."""
        def handler(request):
            data = json.loads(request.read())
            assert data["name"] == "dev-token"
            assert data["circuit_breaker"] == {"enabled": False}
            return httpx.Response(201, json={
                "token_id": "ailink_v1_proj_tok_abc",
                "name": "dev-token",
                "message": "Token created",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.create(
            name="dev-token",
            upstream_url="https://api.openai.com/v1",
            circuit_breaker={"enabled": False},
        )
        assert result["token_id"].startswith("ailink_v1_")

    def test_create_with_circuit_breaker_custom_thresholds(self):
        """tokens.create() sends custom CB thresholds."""
        def handler(request):
            data = json.loads(request.read())
            cb = data["circuit_breaker"]
            assert cb["enabled"] is True
            assert cb["failure_threshold"] == 5
            assert cb["recovery_cooldown_secs"] == 60
            return httpx.Response(201, json={
                "token_id": "ailink_v1_proj_tok_xyz",
                "name": "prod-token",
                "message": "Token created",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.create(
            name="prod-token",
            upstream_url="https://api.anthropic.com/v1",
            circuit_breaker={
                "enabled": True,
                "failure_threshold": 5,
                "recovery_cooldown_secs": 60,
            },
        )
        assert result["name"] == "prod-token"

    def test_create_without_circuit_breaker_omits_field(self):
        """When circuit_breaker is not passed, it should not be in the payload."""
        def handler(request):
            data = json.loads(request.read())
            assert "circuit_breaker" not in data
            return httpx.Response(201, json={
                "token_id": "ailink_v1_proj_tok_def",
                "name": "default-token",
                "message": "Token created",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.create(
            name="default-token",
            upstream_url="https://api.openai.com/v1",
        )
        assert result["token_id"] == "ailink_v1_proj_tok_def"

    def test_upstream_health(self):
        """tokens.upstream_health() returns list of upstream status dicts."""
        def handler(request):
            assert request.url.path == "/api/v1/health/upstreams"
            return httpx.Response(200, json=[
                {
                    "token_id": "tok_123",
                    "url": "https://api.openai.com",
                    "is_healthy": True,
                    "failure_count": 0,
                    "cooldown_remaining_secs": None,
                },
                {
                    "token_id": "tok_123",
                    "url": "https://backup.openai.com",
                    "is_healthy": False,
                    "failure_count": 3,
                    "cooldown_remaining_secs": 15,
                },
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        health = client.tokens.upstream_health()
        assert len(health) == 2
        assert health[0]["is_healthy"] is True
        assert health[1]["is_healthy"] is False
        assert health[1]["failure_count"] == 3

    def test_get_circuit_breaker(self):
        """tokens.get_circuit_breaker() returns CB config for a token."""
        def handler(request):
            assert "/circuit-breaker" in str(request.url)
            assert request.method == "GET"
            return httpx.Response(200, json={
                "enabled": True,
                "failure_threshold": 3,
                "recovery_cooldown_secs": 30,
                "half_open_max_requests": 1,
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        config = client.tokens.get_circuit_breaker("ailink_v1_tok_abc")
        assert config["enabled"] is True
        assert config["failure_threshold"] == 3
        assert config["recovery_cooldown_secs"] == 30

    def test_set_circuit_breaker_disable(self):
        """tokens.set_circuit_breaker() sends PATCH with CB config."""
        def handler(request):
            assert request.method == "PATCH"
            assert "/circuit-breaker" in str(request.url)
            data = json.loads(request.read())
            assert data["enabled"] is False
            assert data["failure_threshold"] == 3  # default
            return httpx.Response(200, json=data)

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.set_circuit_breaker(
            "ailink_v1_tok_abc",
            enabled=False,
        )
        assert result["enabled"] is False

    def test_set_circuit_breaker_custom_thresholds(self):
        """tokens.set_circuit_breaker() sends custom thresholds."""
        def handler(request):
            data = json.loads(request.read())
            assert data["enabled"] is True
            assert data["failure_threshold"] == 5
            assert data["recovery_cooldown_secs"] == 60
            assert data["half_open_max_requests"] == 2
            return httpx.Response(200, json=data)

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.tokens.set_circuit_breaker(
            "ailink_v1_tok_abc",
            enabled=True,
            failure_threshold=5,
            recovery_cooldown_secs=60,
            half_open_max_requests=2,
        )
        assert result["failure_threshold"] == 5
        assert result["recovery_cooldown_secs"] == 60


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
        with patch.dict("sys.modules", {"openai": MagicMock()}):
            import sys
            mock_openai = sys.modules["openai"]
            async with AsyncClient(api_key="key") as client:
                client.openai()
                mock_openai.AsyncOpenAI.assert_called_with(
                    api_key="key",
                    base_url="http://localhost:8443",
                    default_headers=None,
                    max_retries=0,
                )

    async def test_async_anthropic_factory(self):
        """AsyncClient.anthropic() returns an async Anthropic client."""
        with patch.dict("sys.modules", {"anthropic": MagicMock()}):
            import sys
            mock_anthropic = sys.modules["anthropic"]
            async with AsyncClient(api_key="key") as client:
                client.anthropic()
                mock_anthropic.AsyncAnthropic.assert_called()


# ──────────────────────────────────────────────
# 11. Services Resource (Action Gateway)
# ──────────────────────────────────────────────


class TestServicesResource:
    def test_list_returns_service_models(self):
        """services.list() returns List[Service] Pydantic models."""
        def handler(request):
            assert request.url.path == "/api/v1/services"
            return httpx.Response(200, json=[
                {
                    "id": "svc_001",
                    "project_id": "proj_1",
                    "name": "stripe",
                    "description": "Stripe payment API",
                    "base_url": "https://api.stripe.com",
                    "service_type": "generic",
                    "credential_id": "cred_abc",
                    "is_active": True,
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                },
                {
                    "id": "svc_002",
                    "project_id": "proj_1",
                    "name": "openai",
                    "description": "OpenAI LLM",
                    "base_url": "https://api.openai.com",
                    "service_type": "llm",
                    "credential_id": "cred_def",
                    "is_active": True,
                    "created_at": "2026-01-02T00:00:00Z",
                    "updated_at": "2026-01-02T00:00:00Z",
                },
            ])

        client = make_admin(transport=httpx.MockTransport(handler))
        services = client.services.list()

        assert len(services) == 2
        assert isinstance(services[0], Service)
        assert services[0].name == "stripe"
        assert services[0].base_url == "https://api.stripe.com"
        assert services[0].service_type == "generic"
        assert services[0].credential_id == "cred_abc"
        assert services[1].name == "openai"
        assert services[1].service_type == "llm"

    def test_create_sends_correct_payload(self):
        """services.create() sends name, base_url, service_type, and credential_id."""
        def handler(request):
            data = json.loads(request.read())
            assert data["name"] == "slack"
            assert data["base_url"] == "https://slack.com/api"
            assert data["service_type"] == "generic"
            assert data["credential_id"] == "cred_slack"
            assert data["description"] == "Slack workspace API"
            return httpx.Response(201, json={
                "id": "svc_new",
                "project_id": "proj_1",
                "name": "slack",
                "description": "Slack workspace API",
                "base_url": "https://slack.com/api",
                "service_type": "generic",
                "credential_id": "cred_slack",
                "is_active": True,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.services.create(
            name="slack",
            base_url="https://slack.com/api",
            description="Slack workspace API",
            credential_id="cred_slack",
        )

        assert result["id"] == "svc_new"
        assert result["name"] == "slack"

    def test_create_without_credential(self):
        """services.create() works without a credential_id."""
        def handler(request):
            data = json.loads(request.read())
            assert data["name"] == "public-api"
            assert "credential_id" not in data  # Should not be sent when empty
            return httpx.Response(201, json={
                "id": "svc_pub",
                "project_id": "proj_1",
                "name": "public-api",
                "description": "",
                "base_url": "https://api.public.com",
                "service_type": "generic",
                "credential_id": None,
                "is_active": True,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            })

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.services.create(
            name="public-api",
            base_url="https://api.public.com",
        )

        assert result["id"] == "svc_pub"
        assert result["credential_id"] is None

    def test_delete_calls_correct_endpoint(self):
        """services.delete() sends DELETE to /api/v1/services/{id}."""
        def handler(request):
            assert request.method == "DELETE"
            assert "/api/v1/services/svc_001" in str(request.url)
            return httpx.Response(200, json={"deleted": True})

        client = make_admin(transport=httpx.MockTransport(handler))
        result = client.services.delete("svc_001")
        assert result["deleted"] is True

    def test_list_empty(self):
        """services.list() returns empty list when no services registered."""
        def handler(request):
            return httpx.Response(200, json=[])

        client = make_admin(transport=httpx.MockTransport(handler))
        services = client.services.list()
        assert services == []

    def test_service_model_repr(self):
        """Service model has a useful repr."""
        svc = Service(
            id="svc_001",
            name="stripe",
            base_url="https://api.stripe.com",
            service_type="generic",
        )
        assert "stripe" in repr(svc)
        assert "generic" in repr(svc)

    def test_service_model_dict_access(self):
        """Service model supports dict-style access for backward compat."""
        svc = Service(
            id="svc_001",
            name="stripe",
            base_url="https://api.stripe.com",
            service_type="generic",
        )
        assert svc["name"] == "stripe"
        assert "name" in svc


# ──────────────────────────────────────────────
# 12. Async Services Resource
# ──────────────────────────────────────────────


@pytest.mark.anyio
class TestAsyncServicesResource:
    async def test_async_services_list(self):
        """Async services.list() returns Service models."""
        async def handler(request):
            return httpx.Response(200, json=[
                {
                    "id": "svc_async_1",
                    "project_id": "proj_1",
                    "name": "hubspot",
                    "description": "HubSpot CRM",
                    "base_url": "https://api.hubspot.com",
                    "service_type": "generic",
                    "credential_id": "cred_hs",
                    "is_active": True,
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                }
            ])

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            services = await client.services.list()
            assert len(services) == 1
            assert isinstance(services[0], Service)
            assert services[0].name == "hubspot"

    async def test_async_services_create(self):
        """Async services.create() sends correct payload."""
        async def handler(request):
            data = json.loads(await request.aread())
            assert data["name"] == "github"
            return httpx.Response(201, json={
                "id": "svc_gh",
                "project_id": "proj_1",
                "name": "github",
                "description": "GitHub API",
                "base_url": "https://api.github.com",
                "service_type": "generic",
                "credential_id": "cred_gh",
                "is_active": True,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            })

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            result = await client.services.create(
                name="github",
                base_url="https://api.github.com",
                description="GitHub API",
                credential_id="cred_gh",
            )
            assert result["id"] == "svc_gh"

    async def test_async_services_delete(self):
        """Async services.delete() calls correct endpoint."""
        async def handler(request):
            assert request.method == "DELETE"
            return httpx.Response(200, json={"deleted": True})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="key", transport=transport) as client:
            result = await client.services.delete("svc_async_1")
            assert result["deleted"] is True
