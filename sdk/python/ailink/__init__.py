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

from .client import AIlinkClient, AsyncClient
from .types import (
    Token,
    Credential,
    Policy,
    AuditLog,
    ApprovalRequest,
    ApprovalDecision,
    RequestSummary,
)
from .exceptions import (
    AIlinkError,
    AuthenticationError,
    NotFoundError,
    RateLimitError,
    ValidationError,
    GatewayError,
)

# Backward-compatible alias
Client = AIlinkClient

__version__ = "0.1.0"

__all__ = [
    # Clients
    "AIlinkClient",
    "AsyncClient",
    "Client",
    # Types
    "Token",
    "Credential",
    "Policy",
    "AuditLog",
    "ApprovalRequest",
    "ApprovalDecision",
    "RequestSummary",
    # Exceptions
    "AIlinkError",
    "AuthenticationError",
    "NotFoundError",
    "RateLimitError",
    "ValidationError",
    "GatewayError",
    # Metadata
    "__version__",
]
