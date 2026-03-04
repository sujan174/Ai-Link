"""Resource for managing registered services (Action Gateway)."""

from typing import List, Dict, Any, Optional
from ..types import Service
from ..exceptions import raise_for_status


class ServicesResource:
    """Management API resource for external service registrations."""

    def __init__(self, client):
        self._client = client

    def list(self, project_id: Optional[str] = None) -> List[Service]:
        """List all registered services for a project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/services", params=params)
        raise_for_status(resp)
        return [Service(**item) for item in resp.json()]

    def create(
        self,
        name: str,
        base_url: str,
        description: str = "",
        service_type: str = "generic",
        credential_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Register a new external service.

        Args:
            name: Unique service name (used in proxy URL, e.g. 'stripe')
            base_url: Upstream root URL (e.g. 'https://api.stripe.com')
            description: Optional human-readable description
            service_type: 'generic' or 'llm'
            credential_id: UUID of the credential to inject
            project_id: Optional project override

        Returns:
            The created service object.
        """
        payload: Dict[str, Any] = {
            "name": name,
            "base_url": base_url,
            "description": description,
            "service_type": service_type,
        }
        if credential_id:
            payload["credential_id"] = credential_id
        if project_id:
            payload["project_id"] = project_id
        resp = self._client._http.post("/api/v1/services", json=payload)
        raise_for_status(resp)
        return resp.json()

    def delete(self, service_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
        """Delete a registered service."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.delete(f"/api/v1/services/{service_id}", params=params)
        raise_for_status(resp)
        return resp.json()


class AsyncServicesResource:
    """Async Management API resource for external service registrations."""

    def __init__(self, client):
        self._client = client

    async def list(self, project_id: Optional[str] = None) -> List[Service]:
        """List all registered services for a project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/services", params=params)
        raise_for_status(resp)
        return [Service(**item) for item in resp.json()]

    async def create(
        self,
        name: str,
        base_url: str,
        description: str = "",
        service_type: str = "generic",
        credential_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a new external service."""
        payload: Dict[str, Any] = {
            "name": name,
            "base_url": base_url,
            "description": description,
            "service_type": service_type,
        }
        if credential_id:
            payload["credential_id"] = credential_id
        if project_id:
            payload["project_id"] = project_id
        resp = await self._client._http.post("/api/v1/services", json=payload)
        raise_for_status(resp)
        return resp.json()

    async def delete(self, service_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
        """Delete a registered service."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.delete(f"/api/v1/services/{service_id}", params=params)
        raise_for_status(resp)
        return resp.json()
