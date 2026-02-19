from typing import List, Dict, Any, Optional

class AnalyticsResource:
    def __init__(self, client):
        self._client = client

    def get_token_summary(self) -> List[Dict[str, Any]]:
        """Get summary of usage and performance for all tokens."""
        return self._client.get("/analytics/tokens").json()

    def get_token_volume(self, token_id: str) -> List[Dict[str, Any]]:
        """Get hourly request volume for a specific token."""
        return self._client.get(f"/analytics/tokens/{token_id}/volume").json()

    def get_token_status(self, token_id: str) -> List[Dict[str, Any]]:
        """Get status code distribution for a specific token."""
        return self._client.get(f"/analytics/tokens/{token_id}/status").json()

    def get_token_latency(self, token_id: str) -> Dict[str, float]:
        """Get latency percentiles for a specific token."""
        return self._client.get(f"/analytics/tokens/{token_id}/latency").json()

class AsyncAnalyticsResource:
    def __init__(self, client):
        self._client = client

    async def get_token_summary(self) -> List[Dict[str, Any]]:
        response = await self._client.get("/analytics/tokens")
        return response.json()

    async def get_token_volume(self, token_id: str) -> List[Dict[str, Any]]:
        response = await self._client.get(f"/analytics/tokens/{token_id}/volume")
        return response.json()

    async def get_token_status(self, token_id: str) -> List[Dict[str, Any]]:
        response = await self._client.get(f"/analytics/tokens/{token_id}/status")
        return response.json()

    async def get_token_latency(self, token_id: str) -> Dict[str, float]:
        response = await self._client.get(f"/analytics/tokens/{token_id}/latency")
        return response.json()
