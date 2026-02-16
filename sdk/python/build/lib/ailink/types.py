from typing import List, Optional, Dict, Any, Union
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
    id: str
    name: str
    credential_id: str
    upstream_url: str
    project_id: Optional[str] = None
    policy_ids: List[str] = []
    scopes: List[str] = []
    is_active: bool
    created_at: Optional[datetime] = None

class Credential(AIlinkModel):
    id: str
    name: str
    provider: str
    created_at: Optional[datetime] = None

class Policy(AIlinkModel):
    id: str
    name: str
    mode: str
    rules: List[Dict[str, Any]]

class AuditLog(AIlinkModel):
    id: str
    created_at: datetime
    method: str
    path: str
    upstream_status: int
    response_latency_ms: int
    agent_name: Optional[str] = None
    policy_result: Optional[str] = None
    hitl_required: bool = False
    hitl_decision: Optional[str] = None
    hitl_latency_ms: Optional[int] = None
    fields_redacted: List[str] = []
    shadow_violations: List[str] = []

class RequestSummary(AIlinkModel):
    method: str
    path: str
    agent: Optional[str] = None
    upstream: Optional[str] = None

class ApprovalRequest(AIlinkModel):
    id: str
    token_id: str
    status: str  # pending, approved, rejected, expired, timeout
    request_summary: RequestSummary
    expires_at: Optional[datetime] = None
    updated: Optional[bool] = None

class ApprovalDecision(AIlinkModel):
    id: str
    status: str
    updated: bool
