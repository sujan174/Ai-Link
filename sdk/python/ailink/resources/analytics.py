from typing import List, Dict, Any, Optional
from ..exceptions import raise_for_status

class AnalyticsResource:
    def __init__(self, client):
        self._client = client

    def get_token_summary(self) -> List[Dict[str, Any]]:
        """Get summary of usage and performance for all tokens."""
        resp = self._client.get("/analytics/tokens")
        raise_for_status(resp)
        return resp.json()

    def get_token_volume(self, token_id: str) -> List[Dict[str, Any]]:
        """Get hourly request volume for a specific token."""
        resp = self._client.get(f"/analytics/tokens/{token_id}/volume")
        raise_for_status(resp)
        return resp.json()

    def get_token_status(self, token_id: str) -> List[Dict[str, Any]]:
        """Get status code distribution for a specific token."""
        resp = self._client.get(f"/analytics/tokens/{token_id}/status")
        raise_for_status(resp)
        return resp.json()

    def get_token_latency(self, token_id: str) -> Dict[str, float]:
        """Get latency percentiles for a specific token."""
        resp = self._client.get(f"/analytics/tokens/{token_id}/latency")
        raise_for_status(resp)
        return resp.json()

    def spend_breakdown(
        self,
        group_by: str = "model",
        hours: int = 720,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get spend breakdown grouped by a chosen dimension.

        Args:
            group_by: Grouping dimension:
                - "model"     -> spend per LLM model (gpt-4o, claude-3, etc.)
                - "token"     -> spend per virtual token (agent API key)
                - "tag:team"  -> spend per custom tag value (from X-Properties)
                - "tag:env"   -> spend per environment tag
            hours: Time window in hours (default: 720 = 30 days, max: 8760)
            project_id: Optional project ID override.

        Returns:
            A dict with total_cost_usd, total_requests, and breakdown array.

        Example::

            # Spend by model over the last 7 days
            data = admin.analytics.spend_breakdown(group_by="model", hours=168)
            for row in data["breakdown"]:
                print(f"{row['dimension']}: ${row['total_cost_usd']:.2f}")

            # Spend by team tag over the last 30 days
            data = admin.analytics.spend_breakdown(group_by="tag:team")
        """
        params: Dict[str, Any] = {"group_by": group_by, "hours": hours}
        if project_id:
            params["project_id"] = project_id
        resp = self._client.get("/api/v1/analytics/spend/breakdown", params=params)
        raise_for_status(resp)
        return resp.json()


class AsyncAnalyticsResource:
    def __init__(self, client):
        self._client = client

    async def get_token_summary(self) -> List[Dict[str, Any]]:
        response = await self._client.get("/analytics/tokens")
        raise_for_status(response)
        return response.json()

    async def get_token_volume(self, token_id: str) -> List[Dict[str, Any]]:
        response = await self._client.get(f"/analytics/tokens/{token_id}/volume")
        raise_for_status(response)
        return response.json()

    async def get_token_status(self, token_id: str) -> List[Dict[str, Any]]:
        response = await self._client.get(f"/analytics/tokens/{token_id}/status")
        raise_for_status(response)
        return response.json()

    async def get_token_latency(self, token_id: str) -> Dict[str, float]:
        response = await self._client.get(f"/analytics/tokens/{token_id}/latency")
        raise_for_status(response)
        return response.json()

    async def spend_breakdown(
        self,
        group_by: str = "model",
        hours: int = 720,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get spend breakdown -- async version. See sync version for full docs."""
        params: Dict[str, Any] = {"group_by": group_by, "hours": hours}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client.get("/api/v1/analytics/spend/breakdown", params=params)
        raise_for_status(resp)
        return resp.json()
