from .client import AIlinkClient, AsyncClient

# Backward-compatible alias
Client = AIlinkClient

__all__ = ["AIlinkClient", "AsyncClient", "Client"]
