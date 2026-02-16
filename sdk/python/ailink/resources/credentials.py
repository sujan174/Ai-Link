"""Resource for managing encrypted credentials."""

from typing import List, Dict, Any, Optional
from ..types import Credential
from ..exceptions import raise_for_status


class CredentialsResource:
    """Management API resource for credentials (metadata only — no secrets exposed)."""

    def __init__(self, client):
        self._client = client

    def list(self, project_id: Optional[str] = None) -> List[Credential]:
        """List credential metadata for a project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/credentials", params=params)
        raise_for_status(resp)
        return [Credential(**item) for item in resp.json()]

    def create(
        self,
        name: str,
        provider: str,
        secret: str,
        project_id: Optional[str] = None,
        injection_mode: Optional[str] = None,
        injection_header: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new encrypted credential.

        Returns a dict with the credential ``id`` and metadata.
        The secret is encrypted at rest and never returned.
        """
        payload: Dict[str, Any] = {
            "name": name,
            "provider": provider,
            "secret": secret,
        }
        if project_id:
            payload["project_id"] = project_id
        if injection_mode:
            payload["injection_mode"] = injection_mode
        if injection_header:
            payload["injection_header"] = injection_header
        resp = self._client._http.post("/api/v1/credentials", json=payload)
        raise_for_status(resp)
        return resp.json()


class AsyncCredentialsResource:
    """Async Management API resource for credentials."""

    def __init__(self, client):
        self._client = client

    async def list(self, project_id: Optional[str] = None) -> List[Credential]:
        """List credential metadata for a project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/credentials", params=params)
        raise_for_status(resp)
        return [Credential(**item) for item in resp.json()]

    async def create(
        self,
        name: str,
        provider: str,
        secret: str,
        project_id: Optional[str] = None,
        injection_mode: Optional[str] = None,
        injection_header: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new encrypted credential."""
        payload: Dict[str, Any] = {
            "name": name,
            "provider": provider,
            "secret": secret,
        }
        if project_id:
            payload["project_id"] = project_id
        if injection_mode:
            payload["injection_mode"] = injection_mode
        if injection_header:
            payload["injection_header"] = injection_header
        resp = await self._client._http.post("/api/v1/credentials", json=payload)
        raise_for_status(resp)
        return resp.json()
