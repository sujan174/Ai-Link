from __future__ import annotations
import httpx
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

    async def close(self):
        """Close the underlying async HTTP connection pool."""
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        await self.close()

    # ── HTTP Methods ───────────────────────────────────────────

    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Send an HTTP request through the gateway."""
        return await self._http.request(method, url, **kwargs)

    async def get(self, url: str, **kwargs) -> httpx.Response:
        """Send a GET request."""
        return await self._http.get(url, **kwargs)

    async def post(self, url: str, **kwargs) -> httpx.Response:
        """Send a POST request."""
        return await self._http.post(url, **kwargs)

    async def put(self, url: str, **kwargs) -> httpx.Response:
        """Send a PUT request."""
        return await self._http.put(url, **kwargs)

    async def patch(self, url: str, **kwargs) -> httpx.Response:
        """Send a PATCH request."""
        return await self._http.patch(url, **kwargs)

    async def delete(self, url: str, **kwargs) -> httpx.Response:
        """Send a DELETE request."""
        return await self._http.delete(url, **kwargs)

    # ── Provider Factories ─────────────────────────────────────

    def openai(self) -> "openai.AsyncClient":
        """Returns a configured openai.AsyncClient."""
        try:
            import openai
        except ImportError:
            raise ImportError("Please install 'openai' package: pip install ailink[openai]")

        return openai.AsyncClient(
            api_key=self.api_key,
            base_url=self.gateway_url,
            max_retries=0,
        )

    def anthropic(self) -> "anthropic.AsyncAnthropic":
        """Returns a configured anthropic.AsyncAnthropic client."""
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
