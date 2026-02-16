"""Resource for querying audit logs."""

from typing import List, Dict, Any, Optional
from ..types import AuditLog
from ..exceptions import raise_for_status


class AuditResource:
    """Management API resource for audit logs."""

    def __init__(self, client):
        self._client = client

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        project_id: Optional[str] = None,
    ) -> List[AuditLog]:
        """
        List audit logs with pagination.

        Args:
            limit: Max number of logs to return (default: 50)
            offset: Number of logs to skip (default: 0)
            project_id: Optional project filter
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/audit", params=params)
        raise_for_status(resp)
        return [AuditLog(**item) for item in resp.json()]


class AsyncAuditResource:
    """Async Management API resource for audit logs."""

    def __init__(self, client):
        self._client = client

    async def list(
        self,
        limit: int = 50,
        offset: int = 0,
        project_id: Optional[str] = None,
    ) -> List[AuditLog]:
        """List audit logs with pagination."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/audit", params=params)
        raise_for_status(resp)
        return [AuditLog(**item) for item in resp.json()]
