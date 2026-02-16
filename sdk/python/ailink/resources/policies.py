"""Resource for managing security policies."""

from typing import List, Dict, Any, Optional
from ..types import Policy
from ..exceptions import raise_for_status


class PoliciesResource:
    """Management API resource for policies."""

    def __init__(self, client):
        self._client = client

    def list(self, project_id: Optional[str] = None) -> List[Policy]:
        """List all policies for a project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/policies", params=params)
        raise_for_status(resp)
        return [Policy(**item) for item in resp.json()]

    def create(
        self,
        name: str,
        rules: List[Dict[str, Any]],
        mode: str = "enforce",
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new policy with rules.

        Args:
            name: Policy display name
            rules: List of rule dicts using when/then syntax, e.g.
                ``{"when": {"field": "usage.request_count", "operator": "gt", "value": 100}, "then": {"action": "deny", "status": 429, "message": "Rate limit exceeded"}}``
            mode: "enforce" (block violations) or "shadow" (log only)
            project_id: Optional project scope
        """
        payload: Dict[str, Any] = {
            "name": name,
            "rules": rules,
            "mode": mode,
        }
        if project_id:
            payload["project_id"] = project_id
        resp = self._client._http.post("/api/v1/policies", json=payload)
        raise_for_status(resp)
        return resp.json()

    def update(
        self,
        policy_id: str,
        name: Optional[str] = None,
        mode: Optional[str] = None,
        rules: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Update a policy (partial update — only provided fields are changed)."""
        payload: Dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if mode is not None:
            payload["mode"] = mode
        if rules is not None:
            payload["rules"] = rules
        resp = self._client._http.put(f"/api/v1/policies/{policy_id}", json=payload)
        raise_for_status(resp)
        return resp.json()

    def delete(self, policy_id: str) -> Dict[str, Any]:
        """Soft-delete a policy."""
        resp = self._client._http.delete(f"/api/v1/policies/{policy_id}")
        raise_for_status(resp)
        return resp.json()


class AsyncPoliciesResource:
    """Async Management API resource for policies."""

    def __init__(self, client):
        self._client = client

    async def list(self, project_id: Optional[str] = None) -> List[Policy]:
        """List all policies for a project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/policies", params=params)
        raise_for_status(resp)
        return [Policy(**item) for item in resp.json()]

    async def create(
        self,
        name: str,
        rules: List[Dict[str, Any]],
        mode: str = "enforce",
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new policy with rules."""
        payload: Dict[str, Any] = {
            "name": name,
            "rules": rules,
            "mode": mode,
        }
        if project_id:
            payload["project_id"] = project_id
        resp = await self._client._http.post("/api/v1/policies", json=payload)
        raise_for_status(resp)
        return resp.json()

    async def update(
        self,
        policy_id: str,
        name: Optional[str] = None,
        mode: Optional[str] = None,
        rules: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Update a policy (partial update)."""
        payload: Dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if mode is not None:
            payload["mode"] = mode
        if rules is not None:
            payload["rules"] = rules
        resp = await self._client._http.put(f"/api/v1/policies/{policy_id}", json=payload)
        raise_for_status(resp)
        return resp.json()

    async def delete(self, policy_id: str) -> Dict[str, Any]:
        """Soft-delete a policy."""
        resp = await self._client._http.delete(f"/api/v1/policies/{policy_id}")
        raise_for_status(resp)
        return resp.json()
