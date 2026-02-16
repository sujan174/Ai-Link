
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from ailink import Client
from ailink.client import AsyncClient

class TestIdempotency:
    def test_sync_client_idempotency(self):
        """Test that synchronous client injects the idempotency header."""
        key = "idemp-12345-sync"
        with patch("httpx.Client") as MockClient:
            client = Client(api_key="ailink_v1_test", idempotency_key=key)
            
            # Verify header in init
            MockClient.assert_called_with(
                base_url="http://localhost:8443",
                headers={
                    "Authorization": "Bearer ailink_v1_test",
                    "X-AIlink-Idempotency-Key": key
                }
            )

    @pytest.mark.anyio
    async def test_async_client_idempotency(self):
        """Test that async client injects the idempotency header."""
        key = "idemp-67890-async"
        with patch("httpx.AsyncClient") as MockAsyncClient:
            # Make aclose awaitable
            MockAsyncClient.return_value.aclose = AsyncMock()
            
            async with AsyncClient(api_key="ailink_v1_test", idempotency_key=key) as client:
                pass
            
            # Verify header in init
            MockAsyncClient.assert_called_with(
                base_url="http://localhost:8443",
                headers={
                    "Authorization": "Bearer ailink_v1_test",
                    "X-AIlink-Idempotency-Key": key
                }
            )

    def test_no_idempotency_key(self):
        """Test that header is absent when no key is provided."""
        with patch("httpx.Client") as MockClient:
            client = Client(api_key="ailink_v1_test")
            
            MockClient.assert_called_with(
                base_url="http://localhost:8443",
                headers={"Authorization": "Bearer ailink_v1_test"}
            )
