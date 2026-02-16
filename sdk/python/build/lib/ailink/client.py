import httpx
from typing import Optional, Dict, Any


class AIlinkClient:
    """
    AIlink Gateway Client.

    Acts as a factory for configuring upstream providers (OpenAI, Anthropic)
    to use the AIlink Gateway.
    """

    def __init__(
        self,
        api_key: str,
        gateway_url: str = "http://localhost:8443",
        agent_name: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        **kwargs
    ):
        """
        Args:
            api_key: AIlink virtual token (starts with 'ailink_v1_')
            gateway_url: URL of the AIlink gateway (default: http://localhost:8443)
            idempotency_key: Optional key for idempotent requests
            **kwargs: Additional arguments passed to underlying httpx.Client
        """
        self.api_key = api_key
        self.gateway_url = gateway_url.rstrip("/")
        
        headers = {"Authorization": f"Bearer {api_key}"}
        if agent_name:
            headers["X-AIlink-Agent-Name"] = agent_name
        if idempotency_key:
            headers["X-AIlink-Idempotency-Key"] = idempotency_key

        self._http = httpx.Client(
            base_url=self.gateway_url,
            headers=headers,
            **kwargs,
        )

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

    @classmethod
    def admin(cls, admin_key: str, gateway_url: str = "http://localhost:8443", **kwargs) -> "AIlinkClient":
        """
        Create an admin client for Management API operations.

        Args:
            admin_key: Admin key (X-Admin-Key value)
            gateway_url: URL of the AIlink gateway
        """
        instance = cls.__new__(cls)
        instance.api_key = admin_key
        instance.gateway_url = gateway_url.rstrip("/")
        instance._http = httpx.Client(
            base_url=instance.gateway_url,
            headers={
                "X-Admin-Key": admin_key,
                "Content-Type": "application/json",
            },
            **kwargs,
        )
        return instance

    def openai(self) -> "openai.Client":
        """
        Returns a configured openai.Client that routes through the gateway.
        Requires 'openai' package to be installed.
        """
        try:
            import openai
        except ImportError:
            raise ImportError("Please install 'openai' package: pip install ailink[openai]")

        return openai.Client(
            api_key=self.api_key,
            base_url=self.gateway_url,
        )

    def anthropic(self) -> "anthropic.Client":
        """
        Returns a configured anthropic.Client that routes through the gateway.
        Requires 'anthropic' package to be installed.
        """
        try:
            import anthropic
        except ImportError:
            raise ImportError("Please install 'anthropic' package: pip install ailink[anthropic]")

        return anthropic.Client(
            api_key="AILINK_GATEWAY_MANAGED",
            base_url=self.gateway_url,
            default_headers={"Authorization": f"Bearer {self.api_key}"},
        )

    @property
    def tokens(self) -> "TokensResource":
        from .resources.tokens import TokensResource
        return TokensResource(self)

    @property
    def approvals(self) -> "ApprovalsResource":
        from .resources.approvals import ApprovalsResource
        return ApprovalsResource(self)

    @property
    def audit(self) -> "AuditResource":
        from .resources.audit import AuditResource
        return AuditResource(self)

    @property
    def policies(self) -> "PoliciesResource":
        from .resources.policies import PoliciesResource
        return PoliciesResource(self)

    @property
    def credentials(self) -> "CredentialsResource":
        from .resources.credentials import CredentialsResource
        return CredentialsResource(self)


class AsyncClient:
    """
    AIlink Gateway Async Client.

    Async version of the Client for non-blocking operations.
    """

    def __init__(
        self,
        api_key: str,
        gateway_url: str = "http://localhost:8443",
        idempotency_key: Optional[str] = None,
        **kwargs,
    ):
        """
        Args:
            api_key: AIlink virtual token
            gateway_url: Gateway URL
            idempotency_key: Optional key for idempotent requests
            **kwargs: Arguments for httpx.AsyncClient
        """
        self.api_key = api_key
        self.gateway_url = gateway_url.rstrip("/")
        
        headers = {"Authorization": f"Bearer {api_key}"}
        if idempotency_key:
            headers["X-AIlink-Idempotency-Key"] = idempotency_key

        self._http = httpx.AsyncClient(
            base_url=self.gateway_url,
            headers=headers,
            **kwargs,
        )

    async def close(self):
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        await self.close()

    def openai(self) -> "openai.AsyncClient":
        """Returns a configured openai.AsyncClient."""
        try:
            import openai
        except ImportError:
            raise ImportError("Please install 'openai' package: pip install ailink[openai]")

        return openai.AsyncClient(
            api_key=self.api_key,
            base_url=self.gateway_url,
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
        )
    
    @property
    def tokens(self) -> "AsyncTokensResource":
        from .resources.tokens import AsyncTokensResource
        return AsyncTokensResource(self)

    @property
    def approvals(self) -> "AsyncApprovalsResource":
        from .resources.approvals import AsyncApprovalsResource
        return AsyncApprovalsResource(self)

    @property
    def audit(self) -> "AsyncAuditResource":
        from .resources.audit import AsyncAuditResource
        return AsyncAuditResource(self)

    @property
    def policies(self) -> "AsyncPoliciesResource":
        from .resources.policies import AsyncPoliciesResource
        return AsyncPoliciesResource(self)

    @property
    def credentials(self) -> "AsyncCredentialsResource":
        from .resources.credentials import AsyncCredentialsResource
        return AsyncCredentialsResource(self)

