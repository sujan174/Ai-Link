"""
Custom exceptions for the AIlink SDK.

Provides clear, actionable error messages instead of raw httpx.HTTPStatusError.
"""

import httpx


class AIlinkError(Exception):
    """Base exception for all AIlink SDK errors."""

    def __init__(self, message: str, status_code: int = None, response: httpx.Response = None):
        self.message = message
        self.status_code = status_code
        self.response = response
        super().__init__(message)


class AuthenticationError(AIlinkError):
    """Invalid or missing API key / admin key."""
    pass


class PermissionError(AIlinkError):
    """Valid credentials but insufficient permissions."""
    pass


class NotFoundError(AIlinkError):
    """Requested resource does not exist."""
    pass


class RateLimitError(AIlinkError):
    """Rate limit exceeded. Check retry-after header."""

    def __init__(self, message: str, retry_after: float = None, **kwargs):
        self.retry_after = retry_after
        super().__init__(message, **kwargs)


class ValidationError(AIlinkError):
    """Request payload failed server-side validation."""
    pass


class GatewayError(AIlinkError):
    """Gateway returned a 5xx error."""
    pass


def raise_for_status(response: httpx.Response) -> None:
    """
    Check response status and raise the appropriate AIlink exception.

    Use this instead of response.raise_for_status() for better error messages.
    """
    if response.is_success:
        return

    status = response.status_code
    try:
        body = response.json()
        detail = body.get("error", body.get("message", response.text))
    except Exception:
        detail = response.text

    kwargs = {"status_code": status, "response": response}

    if status == 401:
        raise AuthenticationError(f"Authentication failed: {detail}", **kwargs)
    elif status == 403:
        raise PermissionError(f"Permission denied: {detail}", **kwargs)
    elif status == 404:
        raise NotFoundError(f"Resource not found: {detail}", **kwargs)
    elif status == 422:
        raise ValidationError(f"Validation error: {detail}", **kwargs)
    elif status == 429:
        retry_after = response.headers.get("retry-after")
        raise RateLimitError(
            f"Rate limit exceeded: {detail}",
            retry_after=float(retry_after) if retry_after else None,
            **kwargs,
        )
    elif 400 <= status < 500:
        raise AIlinkError(f"Client error ({status}): {detail}", **kwargs)
    elif status >= 500:
        raise GatewayError(f"Gateway error ({status}): {detail}", **kwargs)
