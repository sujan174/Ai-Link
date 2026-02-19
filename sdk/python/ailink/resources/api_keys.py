from typing import List, Optional, Dict, Any
from ..types import Response

class ApiKeysResource:
    def __init__(self, client):
        self._client = client

    def create(
        self,
        name: str,
        role: str,
        scopes: List[str],
        key_prefix: Optional[str] = None,
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new API Key.
        
        Args:
            name: Human-readable name for the key.
            role: Role (admin, member, readonly).
            scopes: List of permission scopes.
            key_prefix: Optional prefix for the key (default: "ak_live").
            org_id: Organization ID (if creating for a specific org as superadmin).
            user_id: User ID (optional).
            
        Returns:
            Dict containing the new key (secret is only returned once).
        """
        payload = {
            "name": name,
            "role": role,
            "scopes": scopes,
        }
        if key_prefix:
            payload["key_prefix"] = key_prefix
        if org_id:
            payload["org_id"] = org_id
        if user_id:
            payload["user_id"] = user_id

        return self._client.post("/auth/keys", json=payload).json()

    def list(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List API Keys."""
        params = {"limit": limit, "offset": offset}
        return self._client.get("/auth/keys", params=params).json()

    def revoke(self, key_id: str) -> Dict[str, Any]:
        """Revoke an API Key."""
        return self._client.delete(f"/auth/keys/{key_id}").json()

    def whoami(self) -> Dict[str, Any]:
        """Get information about the current authentication context."""
        return self._client.get("/auth/whoami").json()


class AsyncApiKeysResource:
    def __init__(self, client):
        self._client = client

    async def create(
        self,
        name: str,
        role: str,
        scopes: List[str],
        key_prefix: Optional[str] = None,
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "name": name,
            "role": role,
            "scopes": scopes,
        }
        if key_prefix:
            payload["key_prefix"] = key_prefix
        if org_id:
            payload["org_id"] = org_id
        if user_id:
            payload["user_id"] = user_id

        response = await self._client.post("/auth/keys", json=payload)
        return response.json()

    async def list(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        params = {"limit": limit, "offset": offset}
        response = await self._client.get("/auth/keys", params=params)
        return response.json()

    async def revoke(self, key_id: str) -> Dict[str, Any]:
        response = await self._client.delete(f"/auth/keys/{key_id}")
        return response.json()

    async def whoami(self) -> Dict[str, Any]:
        response = await self._client.get("/auth/whoami")
        return response.json()
