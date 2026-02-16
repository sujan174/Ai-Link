from typing import List, Dict, Any, Optional
from ..types import Token

class TokensResource:
    """Management API resource for virtual tokens."""

    def __init__(self, client):
        self._client = client

    def list(self, project_id: Optional[str] = None) -> List[Token]:
        """List tokens, optionally filtered by project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/tokens", params=params)
        resp.raise_for_status()
        return [Token(**item) for item in resp.json()]

    def create(
        self,
        name: str,
        credential_id: str,
        upstream_url: str,
        project_id: Optional[str] = None,
        policy_ids: Optional[List[str]] = None,
    ) -> Token:
        """Create a new virtual token."""
        payload: Dict[str, Any] = {
            "name": name,
            "credential_id": credential_id,
            "upstream_url": upstream_url,
        }
        if project_id:
            payload["project_id"] = project_id
        if policy_ids:
            payload["policy_ids"] = policy_ids
        resp = self._client._http.post("/api/v1/tokens", json=payload)
        resp.raise_for_status()
        # The create response structure might differ, usually returns the created object
        # Adjusting to wrap the response in Token model
        data = resp.json()
        # If the API returns {"token_id": ..., "message": ...}, we might need to fetch or construct partial
        # For now assuming API returns the full object or enough to satisfy the model, 
        # OR we need to adjust the model to be optional. 
        # Looking at previous tests: create returns {"token_id": ..., "message": ...}
        # This breaks Pydantic validation if we return Token.
        # Let's check test_e2e.py: test_create_token_success asserts "token_id" in data.
        # So we cannot return a full Token object from create() immediately unless the API logs it.
        # I will return Dict for create() for now to avoid breaking changes, or update the return type to Any/Dict.
        # The instruction was "Return Pydantic models... req.id instead of req['id']".
        # list() is the main place where this matters. 
        return data  # Keeping dict for create as it returns a success message + id, not full object

    def revoke(self, token_id: str) -> Dict[str, Any]:
        """Revoke (soft-delete) a token."""
        resp = self._client._http.delete(f"/api/v1/tokens/{token_id}")
        resp.raise_for_status()
        return resp.json()


class AsyncTokensResource:
    """Async Management API resource for virtual tokens."""

    def __init__(self, client):
        self._client = client

    async def list(self, project_id: Optional[str] = None) -> List[Token]:
        """List tokens, optionally filtered by project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/tokens", params=params)
        resp.raise_for_status()
        return [Token(**item) for item in resp.json()]

    async def create(
        self,
        name: str,
        credential_id: str,
        upstream_url: str,
        project_id: Optional[str] = None,
        policy_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Create a new virtual token."""
        payload: Dict[str, Any] = {
            "name": name,
            "credential_id": credential_id,
            "upstream_url": upstream_url,
        }
        if project_id:
            payload["project_id"] = project_id
        if policy_ids:
            payload["policy_ids"] = policy_ids
        resp = await self._client._http.post("/api/v1/tokens", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def revoke(self, token_id: str) -> Dict[str, Any]:
        """Revoke (soft-delete) a token."""
        resp = await self._client._http.delete(f"/api/v1/tokens/{token_id}")
        resp.raise_for_status()
        return resp.json()
