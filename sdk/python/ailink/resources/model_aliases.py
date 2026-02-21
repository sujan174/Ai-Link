"""Resource for managing model aliases."""

from typing import Any, Dict, List, Optional

from ..exceptions import raise_for_status


class ModelAliasesResource:
    """Management API resource for model aliases.

    Model aliases let you map a short name (e.g. ``"fast"``) to a real model
    (e.g. ``"gpt-4o-mini"``), so agents only ever use logical names and you can
    swap providers without touching agent code.

    Usage::

        admin.model_aliases.create("fast", "gpt-4o-mini")
        admin.model_aliases.create("smart", "claude-opus-4-5")
        admin.model_aliases.list()
        admin.model_aliases.delete("fast")
    """

    def __init__(self, client) -> None:
        self._client = client

    def create(
        self,
        alias: str,
        model: str,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a model alias.

        Args:
            alias: The short name agents will use (e.g. ``"fast"``).
            model: The real model identifier to resolve to (e.g. ``"gpt-4o-mini"``).
            project_id: Optional project scoping. Defaults to the org default project.

        Returns:
            The created alias dict with ``id``, ``alias``, ``model``, ``project_id``.

        Raises:
            ValidationError: If the alias shadows a real model name or creates a chain.
        """
        body: Dict[str, Any] = {"alias": alias, "model": model}
        if project_id:
            body["project_id"] = project_id
        resp = self._client._http.post("/api/v1/model-aliases", json=body)
        raise_for_status(resp)
        return resp.json()

    def list(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all model aliases, optionally filtered by project."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = self._client._http.get("/api/v1/model-aliases", params=params)
        raise_for_status(resp)
        return resp.json()

    def get(self, alias: str) -> Dict[str, Any]:
        """Get a model alias by its alias name."""
        resp = self._client._http.get(f"/api/v1/model-aliases/{alias}")
        raise_for_status(resp)
        return resp.json()

    def delete(self, alias: str) -> None:
        """Delete a model alias."""
        resp = self._client._http.delete(f"/api/v1/model-aliases/{alias}")
        raise_for_status(resp)

    def bulk_create(self, aliases: Dict[str, str], project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Create multiple aliases at once from a dict mapping alias → model.

        Usage::

            admin.model_aliases.bulk_create({
                "fast":    "gpt-4o-mini",
                "smart":   "claude-opus-4-5",
                "cheap":   "gemini-flash-2.0",
                "premium": "gpt-4o",
            })
        """
        return [
            self.create(alias, model, project_id=project_id)
            for alias, model in aliases.items()
        ]


class AsyncModelAliasesResource:
    """Async variant of ModelAliasesResource."""

    def __init__(self, client) -> None:
        self._client = client

    async def create(self, alias: str, model: str, project_id: Optional[str] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"alias": alias, "model": model}
        if project_id:
            body["project_id"] = project_id
        resp = await self._client._http.post("/api/v1/model-aliases", json=body)
        raise_for_status(resp)
        return resp.json()

    async def list(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        params = {}
        if project_id:
            params["project_id"] = project_id
        resp = await self._client._http.get("/api/v1/model-aliases", params=params)
        raise_for_status(resp)
        return resp.json()

    async def delete(self, alias: str) -> None:
        resp = await self._client._http.delete(f"/api/v1/model-aliases/{alias}")
        raise_for_status(resp)
