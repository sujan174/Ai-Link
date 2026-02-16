
import pytest
import httpx
from ailink.client import AsyncClient
from ailink.types import Token, ApprovalRequest
from unittest.mock import patch, MagicMock

# Async tests require an async test runner
# Use pytest-asyncio or anyio plugin (already installed per test_e2e.py which uses anyio)
@pytest.mark.anyio
class TestAsyncClient:
    async def test_async_init(self):
        """Test basic async client initialization."""
        async with AsyncClient(api_key="ailink_v1_test_key") as client:
            assert client.api_key == "ailink_v1_test_key"
            assert isinstance(client._http, httpx.AsyncClient)
            assert client._http.headers["Authorization"] == "Bearer ailink_v1_test_key"

    async def test_async_approvals_list(self):
        """Test listing approvals returns typed ApprovalRequest objects."""
        # Use MockTransport to avoid AsyncMock complexity
        async def handler(request):
            assert request.method == "GET"
            assert request.url.path == "/api/v1/approvals"
            return httpx.Response(200, json=[
                {
                    "id": "req_123",
                    "token_id": "tok_abc",
                    "status": "pending",
                    "request_summary": {
                        "method": "DELETE",
                        "path": "/api/resource",
                        "agent": "test-agent"
                    },
                    "expires_at": "2026-02-15T12:00:00Z"
                }
            ])

        transport = httpx.MockTransport(handler)
        
        async with AsyncClient(api_key="ailink_v1_test", transport=transport) as client:
            approvals = await client.approvals.list()
            
            assert len(approvals) == 1
            assert isinstance(approvals[0], ApprovalRequest)
            # Verify dot notation access
            assert approvals[0].id == "req_123"
            assert approvals[0].request_summary.method == "DELETE"
            # Verify dict access (backward compat)
            assert approvals[0]["status"] == "pending"

    async def test_async_openai_factory(self):
        """Test that .openai() returns an async client."""
        with patch("openai.AsyncClient") as MockAsyncClient:
            async with AsyncClient(api_key="ailink_v1_test") as client:
                openai = client.openai()
                MockAsyncClient.assert_called_with(
                    api_key="ailink_v1_test",
                    base_url="http://localhost:8443",
                )
                assert openai == MockAsyncClient.return_value

    async def test_async_anthropic_factory(self):
        """Test that .anthropic() returns an async client."""
        with patch("anthropic.AsyncAnthropic") as MockAsyncAnthropic:
            async with AsyncClient(api_key="ailink_v1_test") as client:
                claude = client.anthropic()
                MockAsyncAnthropic.assert_called()
