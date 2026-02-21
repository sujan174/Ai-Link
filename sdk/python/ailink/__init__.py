"""
AIlink Python SDK — Official client for the AIlink Gateway.

Usage:

    # Agent proxy client
    from ailink import AIlinkClient
    client = AIlinkClient(api_key="ailink_v1_...")
    oai = client.openai()

    # Admin management client
    admin = AIlinkClient.admin(admin_key="...")
    tokens = admin.tokens.list()
"""

from .client import AIlinkClient, AsyncClient, HealthPoller, AsyncHealthPoller
from .types import (
    Token,
    TokenCreateResponse,
    Credential,
    CredentialCreateResponse,
    Service,
    Policy,
    PolicyCreateResponse,
    AuditLog,
    ApprovalRequest,
    ApprovalDecision,
    RequestSummary,
    Response,
)
from .exceptions import (
    AIlinkError,
    AuthenticationError,
    NotFoundError,
    RateLimitError,
    ValidationError,
    GatewayError,
    SpendCapError,
    PermissionError,
    PolicyDeniedError,
    PayloadTooLargeError,
)

# Backward-compatible alias
Client = AIlinkClient

__version__ = "0.1.0"

__all__ = [
    # Clients
    "AIlinkClient",
    "AsyncClient",
    "Client",
    # Health monitoring
    "HealthPoller",
    "AsyncHealthPoller",
    # Types
    "Token",
    "TokenCreateResponse",
    "Credential",
    "CredentialCreateResponse",
    "Service",
    "Policy",
    "PolicyCreateResponse",
    "AuditLog",
    "ApprovalRequest",
    "ApprovalDecision",
    "RequestSummary",
    "Response",
    # Exceptions
    "AIlinkError",
    "AuthenticationError",
    "NotFoundError",
    "RateLimitError",
    "ValidationError",
    "GatewayError",
    "SpendCapError",
    "PermissionError",
    "PolicyDeniedError",
    "PayloadTooLargeError",
    # Metadata
    "__version__",
]
