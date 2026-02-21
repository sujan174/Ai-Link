"""Resource for managing webhooks."""

from typing import Any, Dict, List, Optional

from ..exceptions import raise_for_status


class WebhooksResource:
    """Management API resource for webhooks.

    Usage::

        wh = admin.webhooks.create(
            url="https://my-server.com/hook",
            events=["request.blocked", "spend_cap.reached"],
        )
        admin.webhooks.test(wh["id"])
    """

    def __init__(self, client) -> None:
        self._client = client

    # ── CRUD ─────────────────────────────────────────────────────────────────

    def create(
        self,
        url: str,
        events: Optional[List[str]] = None,
        secret: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a webhook subscription.

        Args:
            url: HTTPS endpoint that will receive webhook events.
            events: List of event types to subscribe to, e.g.
                ``["request.blocked", "spend_cap.reached"]``.
                If omitted, subscribes to all events.
            secret: Optional signing secret for HMAC verification.
                If omitted, the gateway auto-generates one (returned once).

        Returns:
            Webhook dict including ``id``, ``url``, ``events``, and ``signing_secret``
            (only present on creation, never again).
        """
        body: Dict[str, Any] = {"url": url}
        if events is not None:
            body["events"] = events
        if secret is not None:
            body["signing_secret"] = secret
        resp = self._client._http.post("/api/v1/webhooks", json=body)
        raise_for_status(resp)
        return resp.json()

    def list(self) -> List[Dict[str, Any]]:
        """List all webhook subscriptions for the current org."""
        resp = self._client._http.get("/api/v1/webhooks")
        raise_for_status(resp)
        return resp.json()

    def get(self, webhook_id: str) -> Dict[str, Any]:
        """Get a single webhook by ID."""
        resp = self._client._http.get(f"/api/v1/webhooks/{webhook_id}")
        raise_for_status(resp)
        return resp.json()

    def delete(self, webhook_id: str) -> None:
        """Delete a webhook subscription."""
        resp = self._client._http.delete(f"/api/v1/webhooks/{webhook_id}")
        raise_for_status(resp)

    # ── Testing ───────────────────────────────────────────────────────────────

    def test(self, webhook_id: str) -> Dict[str, Any]:
        """Send a synthetic test event to the webhook.

        Returns the delivery result including HTTP status and response body.
        This is the fastest way to verify your endpoint is configured correctly.
        """
        resp = self._client._http.post(f"/api/v1/webhooks/{webhook_id}/test")
        raise_for_status(resp)
        return resp.json()

    # ── Delivery Logs ─────────────────────────────────────────────────────────

    def deliveries(
        self,
        webhook_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List delivery attempts for a webhook (most recent first).

        Requires P4.1 (webhook delivery logs) to be deployed on the gateway.
        """
        resp = self._client._http.get(
            f"/api/v1/webhooks/{webhook_id}/deliveries",
            params={"limit": limit, "offset": offset},
        )
        raise_for_status(resp)
        return resp.json()


class AsyncWebhooksResource:
    """Async variant of WebhooksResource."""

    def __init__(self, client) -> None:
        self._client = client

    async def create(
        self,
        url: str,
        events: Optional[List[str]] = None,
        secret: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"url": url}
        if events is not None:
            body["events"] = events
        if secret is not None:
            body["signing_secret"] = secret
        resp = await self._client._http.post("/api/v1/webhooks", json=body)
        raise_for_status(resp)
        return resp.json()

    async def list(self) -> List[Dict[str, Any]]:
        resp = await self._client._http.get("/api/v1/webhooks")
        raise_for_status(resp)
        return resp.json()

    async def delete(self, webhook_id: str) -> None:
        resp = await self._client._http.delete(f"/api/v1/webhooks/{webhook_id}")
        raise_for_status(resp)

    async def test(self, webhook_id: str) -> Dict[str, Any]:
        resp = await self._client._http.post(f"/api/v1/webhooks/{webhook_id}/test")
        raise_for_status(resp)
        return resp.json()

    async def deliveries(
        self,
        webhook_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        resp = await self._client._http.get(
            f"/api/v1/webhooks/{webhook_id}/deliveries",
            params={"limit": limit, "offset": offset},
        )
        raise_for_status(resp)
        return resp.json()
