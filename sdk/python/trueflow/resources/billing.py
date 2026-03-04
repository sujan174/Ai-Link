from typing import Dict, Any, Optional
from ..exceptions import raise_for_status

class BillingResource:
    def __init__(self, client):
        self._client = client

    def get_usage(self, period: Optional[str] = None) -> Dict[str, Any]:
        """
        Get usage metrics for the current organization.
        
        Args:
            period: Optional specific billing period (YYYY-MM-DD). Defaults to current month based on server time.
            
        Returns:
            Dict containing usage metrics.
        """
        params = {}
        if period:
            params["period"] = period
        resp = self._client.get("/billing/usage", params=params)
        raise_for_status(resp)
        return resp.json()

class AsyncBillingResource:
    def __init__(self, client):
        self._client = client

    async def get_usage(self, period: Optional[str] = None) -> Dict[str, Any]:
        params = {}
        if period:
            params["period"] = period
        response = await self._client.get("/billing/usage", params=params)
        raise_for_status(response)
        return response.json()
