"""Pydantic models for AIlink API responses."""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AIlinkModel(BaseModel):
    """Base model with dict-access compatibility for backward compatibility."""
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    def __getitem__(self, item):
        return getattr(self, item)

    def __contains__(self, item):
        return item in self.model_dump()


class Token(AIlinkModel):
    """A virtual token that maps an agent to a credential and upstream endpoint."""
    id: str
    name: str
    credential_id: str
    upstream_url: str
    project_id: Optional[str] = None
    policy_ids: List[str] = []
    scopes: List[str] = []
    is_active: bool
    created_at: Optional[datetime] = None

    def __repr__(self) -> str:
        return f"Token(id={self.id!r}, name={self.name!r}, active={self.is_active})"


class Credential(AIlinkModel):
    """An encrypted credential (API key) for an upstream provider."""
    id: str
    name: str
    provider: str
    created_at: Optional[datetime] = None

    def __repr__(self) -> str:
        return f"Credential(id={self.id!r}, name={self.name!r}, provider={self.provider!r})"


class Policy(AIlinkModel):
    """A security policy applied to token requests."""
    id: str
    name: str
    mode: str
    rules: List[Dict[str, Any]]

    def __repr__(self) -> str:
        return f"Policy(id={self.id!r}, name={self.name!r}, mode={self.mode!r})"


class AuditLog(AIlinkModel):
    """A single audit log entry for a proxied request."""
    id: str
    created_at: datetime
    method: str
    path: str
    upstream_status: Optional[int] = None
    response_latency_ms: Optional[int] = None
    agent_name: Optional[str] = None
    policy_result: Optional[str] = None
    hitl_required: bool = False
    hitl_decision: Optional[str] = None
    hitl_latency_ms: Optional[int] = None
    fields_redacted: Optional[List[str]] = []
    shadow_violations: Optional[List[str]] = []

    def __repr__(self) -> str:
        return f"AuditLog(id={self.id!r}, method={self.method!r}, path={self.path!r}, status={self.upstream_status})"


class RequestSummary(AIlinkModel):
    """Summary of the original request, embedded in approval requests."""
    method: str
    path: str
    agent: Optional[str] = None
    upstream: Optional[str] = None

    def __repr__(self) -> str:
        return f"RequestSummary({self.method} {self.path})"


class ApprovalRequest(AIlinkModel):
    """A HITL approval request pending admin review."""
    id: str
    token_id: str
    status: str  # pending, approved, rejected, expired, timeout
    request_summary: RequestSummary
    expires_at: Optional[datetime] = None
    updated: Optional[bool] = None

    def __repr__(self) -> str:
        return f"ApprovalRequest(id={self.id!r}, status={self.status!r})"


class ApprovalDecision(AIlinkModel):
    """The result of an admin approval decision."""
    id: str
    status: str
    updated: bool

    def __repr__(self) -> str:
        return f"ApprovalDecision(id={self.id!r}, status={self.status!r})"
