from typing import List, Dict, Any, Optional
from ..types import ApprovalRequest, ApprovalDecision

class ApprovalsResource:
    def __init__(self, client):
        self._client = client

    def list(self, project_id: Optional[str] = None) -> List[ApprovalRequest]:
        """List pending approval requests."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/approvals", params=params)
        resp.raise_for_status()
        return [ApprovalRequest(**item) for item in resp.json()]

    def approve(self, approval_id: str) -> ApprovalDecision:
        """Approve a pending request."""
        resp = self._client._http.post(
            f"/api/v1/approvals/{approval_id}/decision",
            json={"decision": "approved"},
        )
        resp.raise_for_status()
        return ApprovalDecision(**resp.json())

    def reject(self, approval_id: str) -> ApprovalDecision:
        """Reject a pending request."""
        resp = self._client._http.post(
            f"/api/v1/approvals/{approval_id}/decision",
            json={"decision": "rejected"},
        )
        resp.raise_for_status()
        return ApprovalDecision(**resp.json())


class AsyncApprovalsResource:
    def __init__(self, client):
        self._client = client

    async def list(self, project_id: Optional[str] = None) -> List[ApprovalRequest]:
        """List pending approval requests."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/approvals", params=params)
        resp.raise_for_status()
        return [ApprovalRequest(**item) for item in resp.json()]

    async def approve(self, approval_id: str) -> ApprovalDecision:
        """Approve a pending request."""
        resp = await self._client._http.post(
            f"/api/v1/approvals/{approval_id}/decision",
            json={"decision": "approved"},
        )
        resp.raise_for_status()
        return ApprovalDecision(**resp.json())

    async def reject(self, approval_id: str) -> ApprovalDecision:
        """Reject a pending request."""
        resp = await self._client._http.post(
            f"/api/v1/approvals/{approval_id}/decision",
            json={"decision": "rejected"},
        )
        resp.raise_for_status()
        return ApprovalDecision(**resp.json())
