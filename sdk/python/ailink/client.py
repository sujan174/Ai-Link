from __future__ import annotations
import uuid
import httpx
from contextlib import contextmanager, asynccontextmanager
from functools import cached_property
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    import openai
    import anthropic
    from .resources.tokens import TokensResource, AsyncTokensResource
    from .resources.approvals import ApprovalsResource, AsyncApprovalsResource
    from .resources.audit import AuditResource, AsyncAuditResource
    from .resources.policies import PoliciesResource, AsyncPoliciesResource
    from .resources.credentials import CredentialsResource, AsyncCredentialsResource
    from .resources.projects import ProjectsResource, AsyncProjectsResource
    from .resources.services import ServicesResource, AsyncServicesResource


class AIlinkClient:
    """
    AIlink Gateway Client.

    For agent proxy operations (forwarding LLM requests through the gateway):

        client = AIlinkClient(api_key="ailink_v1_...")
        oai = client.openai()
        oai.chat.completions.create(...)

    For admin management operations:

        admin = AIlinkClient.admin(admin_key="...")
        admin.tokens.list()
    """

    def __init__(
        self,
        api_key: str,
        gateway_url: str = "http://localhost:8443",
        agent_name: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        timeout: float = 30.0,
        **kwargs,
    ):
        """
        Args:
            api_key: AIlink virtual token (starts with 'ailink_v1_')
            gateway_url: URL of the AIlink gateway (default: http://localhost:8443)
            agent_name: Optional name for this agent (sent as X-AIlink-Agent-Name)
            idempotency_key: Optional key for idempotent requests
            timeout: Request timeout in seconds (default: 30)
            **kwargs: Additional arguments passed to httpx.Client
        """
        self.api_key = api_key
        self.gateway_url = gateway_url.rstrip("/")
        self._agent_name = agent_name

        headers = {"Authorization": f"Bearer {api_key}"}
        if agent_name:
            headers["X-AIlink-Agent-Name"] = agent_name
        if idempotency_key:
            headers["X-AIlink-Idempotency-Key"] = idempotency_key

        self._http = httpx.Client(
            base_url=self.gateway_url,
            headers=headers,
            timeout=timeout,
            **kwargs,
        )

    def __repr__(self) -> str:
        name = f", agent_name={self._agent_name!r}" if getattr(self, "_agent_name", None) else ""
        return f"AIlinkClient(gateway_url={self.gateway_url!r}{name})"

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

    def close(self):
        """Close the underlying HTTP connection pool."""
        self._http.close()

    # ── Passthrough / BYOK ─────────────────────────────────────

    @contextmanager
    def with_upstream_key(self, key: str, header: str = "Bearer"):
        """
        Context manager for Passthrough (BYOK) mode.

        When the token has no stored credential, the gateway forwards
        whatever key you supply here directly to the upstream as the
        Authorization header.  The AIlink token still authenticates *you*
        to the gateway; this key authenticates the gateway to the upstream.

        Args:
            key:    The upstream API key (e.g. "sk-...").
            header: Auth scheme prefix (default: "Bearer").

        Example::

            with client.with_upstream_key("sk-my-openai-key") as byok:
                resp = byok.post("/v1/chat/completions", json={...})
        """
        auth_value = f"{header} {key}" if header else key
        scoped = _ScopedClient(
            self._http,
            extra_headers={"X-Real-Authorization": auth_value},
        )
        try:
            yield scoped
        finally:
            pass  # parent client owns the connection pool

    # ── Session Tracing ────────────────────────────────────────

    @contextmanager
    def trace(
        self,
        session_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ):
        """
        Context manager that injects distributed-tracing headers.

        All requests made inside the block are tagged with the given
        session and span IDs, which appear in audit logs and can be
        used to correlate multi-step agent workflows.

        Args:
            session_id:     Logical session identifier (auto-generated if omitted).
            parent_span_id: Parent span for nested traces.

        Example::

            with client.trace(session_id="conv-abc123") as t:
                t.post("/v1/chat/completions", json={...})
                t.post("/v1/chat/completions", json={...})  # same session
        """
        sid = session_id or str(uuid.uuid4())
        extra: dict = {"x-session-id": sid}
        if parent_span_id:
            extra["x-parent-span-id"] = parent_span_id
        scoped = _ScopedClient(self._http, extra_headers=extra)
        try:
            yield scoped
        finally:
            pass

    # ── HTTP Methods ───────────────────────────────────────────

    def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Send an HTTP request through the gateway."""
        return self._http.request(method, url, **kwargs)

    def get(self, url: str, **kwargs) -> httpx.Response:
        """Send a GET request."""
        return self._http.get(url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        """Send a POST request."""
        return self._http.post(url, **kwargs)

    def put(self, url: str, **kwargs) -> httpx.Response:
        """Send a PUT request."""
        return self._http.put(url, **kwargs)

    def patch(self, url: str, **kwargs) -> httpx.Response:
        """Send a PATCH request."""
        return self._http.patch(url, **kwargs)

    def delete(self, url: str, **kwargs) -> httpx.Response:
        """Send a DELETE request."""
        return self._http.delete(url, **kwargs)

    # ── Admin Factory ──────────────────────────────────────────

    @classmethod
    def admin(cls, admin_key: str, gateway_url: str = "http://localhost:8443", **kwargs) -> "AIlinkClient":
        """
        Create an admin client for Management API operations.

        Args:
            admin_key: Admin key (X-Admin-Key header value)
            gateway_url: URL of the AIlink gateway
        """
        instance = cls.__new__(cls)
        instance.api_key = admin_key
        instance.gateway_url = gateway_url.rstrip("/")
        instance._agent_name = None
        instance._http = httpx.Client(
            base_url=instance.gateway_url,
            headers={
                "X-Admin-Key": admin_key,
                "Content-Type": "application/json",
            },
            **kwargs,
        )
        return instance

    # ── Provider Factories ─────────────────────────────────────

    def openai(self) -> "openai.Client":
        """
        Returns a configured openai.Client that routes through the gateway.

        Requires 'openai' package: pip install ailink[openai]
        """
        try:
            import openai
        except ImportError:
            raise ImportError("Please install 'openai' package: pip install ailink[openai]")

        return openai.Client(
            api_key=self.api_key,
            base_url=self.gateway_url,
            max_retries=0,
        )

    def anthropic(self) -> "anthropic.Client":
        """
        Returns a configured anthropic.Client that routes through the gateway.

        Requires 'anthropic' package: pip install ailink[anthropic]
        """
        try:
            import anthropic
        except ImportError:
            raise ImportError("Please install 'anthropic' package: pip install ailink[anthropic]")

        return anthropic.Client(
            api_key="AILINK_GATEWAY_MANAGED",
            base_url=self.gateway_url,
            default_headers={"Authorization": f"Bearer {self.api_key}"},
            max_retries=0,
        )

    # ── Resource Properties (cached) ───────────────────────────

    @cached_property
    def tokens(self) -> "TokensResource":
        from .resources.tokens import TokensResource
        return TokensResource(self)

    @cached_property
    def approvals(self) -> "ApprovalsResource":
        from .resources.approvals import ApprovalsResource
        return ApprovalsResource(self)

    @cached_property
    def audit(self) -> "AuditResource":
        from .resources.audit import AuditResource
        return AuditResource(self)

    @cached_property
    def policies(self) -> "PoliciesResource":
        from .resources.policies import PoliciesResource
        return PoliciesResource(self)

    @cached_property
    def credentials(self) -> "CredentialsResource":
        from .resources.credentials import CredentialsResource
        return CredentialsResource(self)

    @cached_property
    def projects(self) -> "ProjectsResource":
        from .resources.projects import ProjectsResource
        return ProjectsResource(self)

    @cached_property
    def services(self) -> "ServicesResource":
        from .resources.services import ServicesResource
        return ServicesResource(self)

    @cached_property
    def api_keys(self) -> "ApiKeysResource":
        from .resources.api_keys import ApiKeysResource
        return ApiKeysResource(self)

    @cached_property
    def billing(self) -> "BillingResource":
        from .resources.billing import BillingResource
        return BillingResource(self)

    @cached_property
    def analytics(self) -> "AnalyticsResource":
        from .resources.analytics import AnalyticsResource
        return AnalyticsResource(self)


class AsyncClient:
    """
    AIlink Gateway Async Client.

    Supports async context manager for clean resource management:

        async with AsyncClient(api_key="ailink_v1_...") as client:
            oai = client.openai()
    """

    def __init__(
        self,
        api_key: str,
        gateway_url: str = "http://localhost:8443",
        agent_name: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        timeout: float = 30.0,
        **kwargs,
    ):
        """
        Args:
            api_key: AIlink virtual token
            gateway_url: Gateway URL
            agent_name: Optional name for this agent
            idempotency_key: Optional key for idempotent requests
            timeout: Request timeout in seconds (default: 30)
            **kwargs: Arguments for httpx.AsyncClient
        """
        self.api_key = api_key
        self.gateway_url = gateway_url.rstrip("/")
        self._agent_name = agent_name

        headers = {"Authorization": f"Bearer {api_key}"}
        if agent_name:
            headers["X-AIlink-Agent-Name"] = agent_name
        if idempotency_key:
            headers["X-AIlink-Idempotency-Key"] = idempotency_key

        self._http = httpx.AsyncClient(
            base_url=self.gateway_url,
            headers=headers,
            timeout=timeout,
            **kwargs,
        )

    def __repr__(self) -> str:
        name = f", agent_name={self._agent_name!r}" if self._agent_name else ""
        return f"AsyncClient(gateway_url={self.gateway_url!r}{name})"

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def close(self):
        """Close the underlying HTTP connection pool."""
        await self._http.aclose()

    # ── Passthrough / BYOK ─────────────────────────────────────

    @asynccontextmanager
    async def with_upstream_key(self, key: str, header: str = "Bearer"):
        """
        Async context manager for Passthrough (BYOK) mode.

        Example::

            async with client.with_upstream_key("sk-my-key") as byok:
                resp = await byok.post("/v1/chat/completions", json={...})
        """
        auth_value = f"{header} {key}" if header else key
        scoped = _AsyncScopedClient(
            self._http,
            extra_headers={"X-Real-Authorization": auth_value},
        )
        try:
            yield scoped
        finally:
            pass

    # ── Session Tracing ────────────────────────────────────────

    @asynccontextmanager
    async def trace(
        self,
        session_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ):
        """
        Async context manager that injects distributed-tracing headers.

        Example::

            async with client.trace(session_id="conv-abc123") as t:
                await t.post("/v1/chat/completions", json={...})
        """
        sid = session_id or str(uuid.uuid4())
        extra: dict = {"x-session-id": sid}
        if parent_span_id:
            extra["x-parent-span-id"] = parent_span_id
        scoped = _AsyncScopedClient(self._http, extra_headers=extra)
        try:
            yield scoped
        finally:
            pass

    # ── HTTP Methods ───────────────────────────────────────────

    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Send an HTTP request through the gateway."""
        return await self._http.request(method, url, **kwargs)

    async def get(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.get(url, **kwargs)

    async def post(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.post(url, **kwargs)

    async def put(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.put(url, **kwargs)

    async def patch(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.patch(url, **kwargs)

    async def delete(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.delete(url, **kwargs)

    # ── Provider Factories ─────────────────────────────────────

    def openai(self) -> "openai.AsyncOpenAI":
        try:
            import openai
        except ImportError:
            raise ImportError("Please install 'openai' package: pip install ailink[openai]")

        return openai.AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.gateway_url,
            default_headers={"X-AIlink-Agent-Name": self._agent_name} if self._agent_name else None,
            max_retries=0,
        )

    def anthropic(self) -> "anthropic.AsyncAnthropic":
        try:
            import anthropic
        except ImportError:
            raise ImportError("Please install 'anthropic' package: pip install ailink[anthropic]")

        return anthropic.AsyncAnthropic(
            api_key="AILINK_GATEWAY_MANAGED",
            base_url=self.gateway_url,
            default_headers={"Authorization": f"Bearer {self.api_key}"},
            max_retries=0,
        )

    # ── Resource Properties (cached) ───────────────────────────

    @cached_property
    def tokens(self) -> "AsyncTokensResource":
        from .resources.tokens import AsyncTokensResource
        return AsyncTokensResource(self)

    @cached_property
    def approvals(self) -> "AsyncApprovalsResource":
        from .resources.approvals import AsyncApprovalsResource
        return AsyncApprovalsResource(self)

    @cached_property
    def audit(self) -> "AsyncAuditResource":
        from .resources.audit import AsyncAuditResource
        return AsyncAuditResource(self)

    @cached_property
    def policies(self) -> "AsyncPoliciesResource":
        from .resources.policies import AsyncPoliciesResource
        return AsyncPoliciesResource(self)

    @cached_property
    def credentials(self) -> "AsyncCredentialsResource":
        from .resources.credentials import AsyncCredentialsResource
        return AsyncCredentialsResource(self)

    @cached_property
    def projects(self) -> "AsyncProjectsResource":
        from .resources.projects import AsyncProjectsResource
        return AsyncProjectsResource(self)

    @cached_property
    def services(self) -> "AsyncServicesResource":
        from .resources.services import AsyncServicesResource
        return AsyncServicesResource(self)

    @cached_property
    def api_keys(self) -> "AsyncApiKeysResource":
        from .resources.api_keys import AsyncApiKeysResource
        return AsyncApiKeysResource(self)

    @cached_property
    def billing(self) -> "AsyncBillingResource":
        from .resources.billing import AsyncBillingResource
        return AsyncBillingResource(self)

    @cached_property
    def analytics(self) -> "AsyncAnalyticsResource":
        from .resources.analytics import AsyncAnalyticsResource
        return AsyncAnalyticsResource(self)


# ── Scoped helpers (internal) ─────────────────────────────────────────────────
#
# These are lightweight wrappers returned by with_upstream_key() and trace().
# They share the parent's httpx client (connection pool) but merge extra headers
# into every request.  They intentionally expose only HTTP methods — no admin
# resources — because they are short-lived, single-purpose objects.


class _ScopedClient:
    """Sync scoped client that merges extra headers into every request."""

    def __init__(self, http: httpx.Client, extra_headers: dict):
        self._http = http
        self._extra = extra_headers

    def _merge(self, kwargs: dict) -> dict:
        existing = dict(kwargs.pop("headers", {}) or {})
        kwargs["headers"] = {**existing, **self._extra}
        return kwargs

    def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        return self._http.request(method, url, **self._merge(kwargs))

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self._http.get(url, **self._merge(kwargs))

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self._http.post(url, **self._merge(kwargs))

    def put(self, url: str, **kwargs) -> httpx.Response:
        return self._http.put(url, **self._merge(kwargs))

    def patch(self, url: str, **kwargs) -> httpx.Response:
        return self._http.patch(url, **self._merge(kwargs))

    def delete(self, url: str, **kwargs) -> httpx.Response:
        return self._http.delete(url, **self._merge(kwargs))


class _AsyncScopedClient:
    """Async scoped client that merges extra headers into every request."""

    def __init__(self, http: httpx.AsyncClient, extra_headers: dict):
        self._http = http
        self._extra = extra_headers

    def _merge(self, kwargs: dict) -> dict:
        existing = dict(kwargs.pop("headers", {}) or {})
        kwargs["headers"] = {**existing, **self._extra}
        return kwargs

    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        return await self._http.request(method, url, **self._merge(kwargs))

    async def get(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.get(url, **self._merge(kwargs))

    async def post(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.post(url, **self._merge(kwargs))

    async def put(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.put(url, **self._merge(kwargs))

    async def patch(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.patch(url, **self._merge(kwargs))

    async def delete(self, url: str, **kwargs) -> httpx.Response:
        return await self._http.delete(url, **self._merge(kwargs))
