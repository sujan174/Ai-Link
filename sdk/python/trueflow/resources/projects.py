"""Resource for managing projects."""

from typing import List, Dict, Any, Optional
from ..exceptions import raise_for_status

class ProjectsResource:
    """Management API resource for projects."""

    def __init__(self, client):
        self._client = client

    def list(self) -> List[Dict[str, Any]]:
        """List all projects."""
        resp = self._client._http.get("/api/v1/projects")
        raise_for_status(resp)
        return resp.json()

    def create(self, name: str) -> Dict[str, Any]:
        """Create a new project."""
        payload = {"name": name}
        resp = self._client._http.post("/api/v1/projects", json=payload)
        raise_for_status(resp)
        return resp.json()

    def delete(self, project_id: str) -> None:
        """Delete a project."""
        resp = self._client._http.delete(f"/api/v1/projects/{project_id}")
        raise_for_status(resp)


class AsyncProjectsResource:
    """Async Management API resource for projects."""

    def __init__(self, client):
        self._client = client

    async def list(self) -> List[Dict[str, Any]]:
        """List all projects."""
        resp = await self._client._http.get("/api/v1/projects")
        raise_for_status(resp)
        return resp.json()

    async def create(self, name: str) -> Dict[str, Any]:
        """Create a new project."""
        payload = {"name": name}
        resp = await self._client._http.post("/api/v1/projects", json=payload)
        raise_for_status(resp)
        return resp.json()

    async def delete(self, project_id: str) -> None:
        """Delete a project."""
        resp = await self._client._http.delete(f"/api/v1/projects/{project_id}")
        raise_for_status(resp)
