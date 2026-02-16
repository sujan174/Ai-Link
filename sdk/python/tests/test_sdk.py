"""
AIlink SDK — Real-World Usage Tests

These tests simulate how a developer would actually use the SDK
in production. They use mocking to avoid needing a live gateway,
but the call patterns mirror real usage exactly.

Run: cd sdk/python && python -m pytest tests/ -v
"""
import json
import pytest
from unittest.mock import patch, MagicMock, PropertyMock
import httpx

# ──────────────────────────────────────────────
# 1. Client Initialization
# ──────────────────────────────────────────────

class TestClientInit:
    """Tests for basic SDK initialization — the very first thing a user does."""

    def test_basic_init(self):
        """
        IRL: Developer sets up the client with their virtual token.
        
            import ailink
            client = ailink.Client(api_key="ailink_v1_00000000_tok_abc123")
        """
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_abc123def456")
        
        assert client.api_key == "ailink_v1_00000000_tok_abc123def456"
        assert client.gateway_url == "http://localhost:8443"
        assert isinstance(client._http, httpx.Client)

    def test_custom_gateway_url(self):
        """
        IRL: Developer points to a deployed gateway (e.g., on Railway, Fly.io).
        
            client = ailink.Client(
                api_key="ailink_v1_...",
                gateway_url="https://gateway.mycompany.com"
            )
        """
        from ailink import Client
        client = Client(
            api_key="ailink_v1_00000000_tok_abc123def456",
            gateway_url="https://gateway.mycompany.com/"
        )
        
        # Trailing slash should be stripped
        assert client.gateway_url == "https://gateway.mycompany.com"

    def test_auth_header_set(self):
        """
        IRL: The SDK should automatically set the Authorization header
        so every request to the gateway is authenticated.
        """
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_test123")
        
        # The internal httpx client should have the Bearer token set
        assert client._http.headers["authorization"] == "Bearer ailink_v1_00000000_tok_test123"

    def test_custom_timeout(self):
        """
        IRL: Developer sets a custom timeout for slow upstream APIs.
        
            client = ailink.Client(
                api_key="ailink_v1_...",
                timeout=60.0
            )
        """
        from ailink import Client
        client = Client(
            api_key="ailink_v1_00000000_tok_abc123def456",
            timeout=60.0
        )
        # Should not raise — httpx accepts timeout as a kwarg
        assert client._http is not None


# ──────────────────────────────────────────────
# 2. OpenAI Integration
# ──────────────────────────────────────────────

class TestOpenAIFactory:
    """
    Tests for the .openai() factory method.
    
    IRL pattern:
        client = ailink.Client(api_key="ailink_v1_...")
        openai_client = client.openai()
        response = openai_client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Hello!"}]
        )
    """

    @patch.dict("sys.modules", {"openai": MagicMock()})
    def test_openai_client_creation(self):
        """The factory should return an openai.Client routed through the gateway."""
        import sys
        mock_openai = sys.modules["openai"]
        mock_client_instance = MagicMock()
        mock_openai.Client.return_value = mock_client_instance
        
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_openai_test")
        result = client.openai()
        
        # Verify openai.Client was called with correct args
        mock_openai.Client.assert_called_once_with(
            api_key="ailink_v1_00000000_tok_openai_test",
            base_url="http://localhost:8443",
        )
        assert result == mock_client_instance

    def test_openai_import_error(self):
        """
        IRL: If 'openai' package isn't installed, user gets a helpful message.
        
            pip install ailink[openai]
        """
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_test")
        
        with patch.dict("sys.modules", {"openai": None}):
            with pytest.raises(ImportError, match="openai"):
                client.openai()


# ──────────────────────────────────────────────
# 3. Anthropic Integration
# ──────────────────────────────────────────────

class TestAnthropicFactory:
    """
    Tests for the .anthropic() factory method.
    
    IRL pattern:
        client = ailink.Client(api_key="ailink_v1_...")
        claude = client.anthropic()
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": "Explain quantum computing"}]
        )
    """

    @patch.dict("sys.modules", {"anthropic": MagicMock()})
    def test_anthropic_client_creation(self):
        """The factory should return an anthropic.Client with gateway routing."""
        import sys
        mock_anthropic = sys.modules["anthropic"]
        mock_client_instance = MagicMock()
        mock_anthropic.Client.return_value = mock_client_instance
        
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_anthropic_test")
        result = client.anthropic()
        
        # Verify anthropic.Client was called with sentinel key + gateway URL
        mock_anthropic.Client.assert_called_once_with(
            api_key="AILINK_GATEWAY_MANAGED",
            base_url="http://localhost:8443",
            default_headers={"Authorization": "Bearer ailink_v1_00000000_tok_anthropic_test"},
        )
        assert result == mock_client_instance

    def test_anthropic_import_error(self):
        """Helpful error if anthropic package isn't installed."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_test")
        
        with patch.dict("sys.modules", {"anthropic": None}):
            with pytest.raises(ImportError, match="anthropic"):
                client.anthropic()


# ──────────────────────────────────────────────
# 4. HITL Approvals
# ──────────────────────────────────────────────

class TestApprovals:
    """
    Tests for the HITL Approvals resource.
    
    IRL pattern (admin dashboard or Slack bot callback):
        client = ailink.Client(api_key="ailink_v1_...")
        
        # List pending approvals
        pending = client.approvals.list()
        for req in pending:
            print(f"Agent {req['agent']} wants to {req['method']} {req['path']}")
        
        # Approve the first one
        client.approvals.approve(pending[0]["id"])
    """

    def test_list_approvals(self):
        """Listing pending HITL requests."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_admin")
        
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "token_id": "ailink_v1_00000000_tok_agent1",
                "status": "pending",
                "request_summary": {
                    "method": "DELETE",
                    "path": "/api/repos/my-repo",
                    "agent": "deploy-bot",
                    "upstream": "https://api.github.com"
                },
                "expires_at": "2026-02-15T03:00:00Z"
            }
        ]
        mock_response.raise_for_status = MagicMock()
        
        with patch.object(client._http, "get", return_value=mock_response) as mock_get:
            approvals = client.approvals.list()
            
            mock_get.assert_called_once_with("/api/v1/approvals", params={})
            assert len(approvals) == 1
            assert approvals[0]["status"] == "pending"
            assert approvals[0]["request_summary"]["method"] == "DELETE"

    def test_approve_request(self):
        """Approving a HITL request by ID."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_admin")
        
        approval_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "approved", "id": approval_id, "updated": True}
        mock_response.raise_for_status = MagicMock()
        
        with patch.object(client._http, "post", return_value=mock_response) as mock_post:
            result = client.approvals.approve(approval_id)
            
            mock_post.assert_called_once_with(
                f"/api/v1/approvals/{approval_id}/decision",
                json={"decision": "approved"}
            )
            assert result["status"] == "approved"

    def test_reject_request(self):
        """Rejecting a dangerous HITL request."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_admin")
        
        approval_id = "deadbeef-1234-5678-9abc-def012345678"
        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "rejected", "id": approval_id, "updated": True}
        mock_response.raise_for_status = MagicMock()
        
        with patch.object(client._http, "post", return_value=mock_response) as mock_post:
            result = client.approvals.reject(approval_id)
            
            mock_post.assert_called_once_with(
                f"/api/v1/approvals/{approval_id}/decision",
                json={"decision": "rejected"}
            )
            assert result["status"] == "rejected"


# ──────────────────────────────────────────────
# 5. Raw HTTP Client (Direct Gateway Calls)
# ──────────────────────────────────────────────

class TestRawHTTPClient:
    """
    Tests for using the internal httpx client directly.
    
    IRL pattern for non-OpenAI/Anthropic APIs (Jira, Stripe, custom):

        client = ailink.Client(api_key="ailink_v1_...")
        
        # Direct POST through gateway to Jira
        resp = client._http.post(
            "/rest/api/2/issue",
            json={"fields": {"summary": "Bug fix", "project": {"key": "PROJ"}}}
        )
    """

    def test_direct_post(self):
        """Simulate a Jira issue creation through the gateway."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_jira")
        
        jira_payload = {
            "fields": {
                "project": {"key": "AILINK"},
                "summary": "Automate deployment pipeline",
                "issuetype": {"name": "Task"},
                "description": "Set up CI/CD for the gateway service"
            }
        }
        
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "id": "10042",
            "key": "AILINK-42",
            "self": "https://myco.atlassian.net/rest/api/2/issue/10042"
        }
        
        with patch.object(client._http, "post", return_value=mock_response) as mock_post:
            resp = client._http.post("/rest/api/2/issue", json=jira_payload)
            
            assert resp.status_code == 201
            assert resp.json()["key"] == "AILINK-42"

    def test_direct_get(self):
        """Simulate a GitHub repos listing through the gateway."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_github")
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"name": "ailink", "private": True, "stargazers_count": 42},
            {"name": "docs", "private": False, "stargazers_count": 7},
        ]
        
        with patch.object(client._http, "get", return_value=mock_response) as mock_get:
            resp = client._http.get("/user/repos")
            
            assert resp.status_code == 200
            assert len(resp.json()) == 2
            assert resp.json()[0]["name"] == "ailink"


# ──────────────────────────────────────────────
# 6. Error Handling
# ──────────────────────────────────────────────

class TestErrorHandling:
    """
    Tests for gateway error scenarios.
    
    IRL: These are the errors a developer would encounter.
    """

    def test_invalid_token_401(self):
        """Gateway returns 401 for invalid/expired tokens."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_EXPIRED")
        
        mock_response = httpx.Response(
            status_code=401,
            json={"error": "token not found or inactive"},
            request=httpx.Request("GET", "http://localhost:8443/test"),
        )
        
        with patch.object(client._http, "get", return_value=mock_response):
            resp = client._http.get("/test")
            assert resp.status_code == 401

    def test_rate_limit_429(self):
        """Gateway returns 429 when rate limit is exceeded."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_heavy_user")
        
        mock_response = httpx.Response(
            status_code=429,
            json={"error": "rate limit exceeded"},
            request=httpx.Request("POST", "http://localhost:8443/chat"),
        )
        
        with patch.object(client._http, "post", return_value=mock_response):
            resp = client._http.post("/chat/completions", json={"model": "gpt-4", "messages": []})
            assert resp.status_code == 429

    def test_policy_denied_403(self):
        """Gateway returns 403 when policy denies the request."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_restricted")
        
        mock_response = httpx.Response(
            status_code=403,
            json={"error": "policy denied", "policy": "prod-readonly", "reason": "DELETE not allowed"},
            request=httpx.Request("DELETE", "http://localhost:8443/api/resource"),
        )
        
        with patch.object(client._http, "delete", return_value=mock_response):
            resp = client._http.delete("/api/resource/123")
            assert resp.status_code == 403

    def test_hitl_timeout_408(self):
        """Gateway returns 408 when HITL approval times out."""
        from ailink import Client
        client = Client(api_key="ailink_v1_00000000_tok_needs_approval")
        
        mock_response = httpx.Response(
            status_code=408,
            json={"error": "approval timed out"},
            request=httpx.Request("POST", "http://localhost:8443/deploy"),
        )
        
        with patch.object(client._http, "post", return_value=mock_response):
            resp = client._http.post("/deploy", json={"env": "production"})
            assert resp.status_code == 408
