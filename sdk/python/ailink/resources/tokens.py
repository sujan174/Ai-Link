"""Resource for managing virtual tokens."""

from typing import List, Dict, Any, Optional
from ..types import Token
from ..exceptions import raise_for_status


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
        raise_for_status(resp)
        return [Token(**item) for item in resp.json()]

    def create(
        self,
        name: str,
        credential_id: str,
        upstream_url: str,
        project_id: Optional[str] = None,
        policy_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new virtual token.

        Returns a dict with ``token_id`` (the ailink_v1_ prefixed key)
        and metadata. Use ``result["token_id"]`` to get the token string.
        """
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
        raise_for_status(resp)
        return resp.json()

    def revoke(self, token_id: str) -> Dict[str, Any]:
        """Revoke (soft-delete) a token."""
        resp = self._client._http.delete(f"/api/v1/tokens/{token_id}")
        raise_for_status(resp)
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
        raise_for_status(resp)
        return [Token(**item) for item in resp.json()]

    async def create(
        self,
        name: str,
        credential_id: str,
        upstream_url: str,
        project_id: Optional[str] = None,
        policy_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new virtual token.

        Returns a dict with ``token_id`` (the ailink_v1_ prefixed key).
        """
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
        raise_for_status(resp)
        return resp.json()

    async def revoke(self, token_id: str) -> Dict[str, Any]:
        """Revoke (soft-delete) a token."""
        resp = await self._client._http.delete(f"/api/v1/tokens/{token_id}")
        raise_for_status(resp)
        return resp.json()
