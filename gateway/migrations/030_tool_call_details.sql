-- Structured tool-call audit logging.
-- Breaks out the flat JSONB tool_calls blob into queryable per-call rows
-- so SOC-2 auditors can filter by tool name, search arguments, and trace
-- causal chains from session → request → tool call.

CREATE TABLE IF NOT EXISTS tool_call_details (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    audit_log_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Indexed tool name for fast queries: "WHERE tool_name = 'stripe.createCharge'"
    tool_name VARCHAR(255) NOT NULL,
    -- Tool call ID from the LLM response (e.g., "call_abc123")
    tool_call_id VARCHAR(255),
    -- Full arguments as JSON for audit trail
    arguments JSONB,
    -- Tool call result (if captured in post-flight)
    result JSONB,
    -- Ordinal position within the request's tool_calls array
    call_index SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

-- Query patterns:
-- 1. "Show all stripe.createCharge calls in the last 24h"
CREATE INDEX idx_tool_call_name ON tool_call_details(tool_name, created_at DESC);
-- 2. "Show all tool calls for audit log X"
CREATE INDEX idx_tool_call_audit ON tool_call_details(audit_log_id);
-- 3. "Find tool calls by LLM-assigned call ID"
CREATE INDEX idx_tool_call_id ON tool_call_details(tool_call_id) WHERE tool_call_id IS NOT NULL;
