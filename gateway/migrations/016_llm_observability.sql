-- LLM Observability: tool calls, traces, error classification
-- Adds columns for structured LLM response data extraction.

-- Tool call tracking
ALTER TABLE audit_logs ADD COLUMN tool_calls JSONB;
ALTER TABLE audit_logs ADD COLUMN tool_call_count SMALLINT DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN finish_reason VARCHAR(50);

-- Trace / session grouping
ALTER TABLE audit_logs ADD COLUMN session_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN parent_span_id VARCHAR(32);
-- note: trace_id already exists from 005_audit_logs.sql

-- LLM error classification
ALTER TABLE audit_logs ADD COLUMN error_type VARCHAR(50);

-- Is this a streaming response?
ALTER TABLE audit_logs ADD COLUMN is_streaming BOOLEAN DEFAULT false;

-- Indexes for common query patterns
CREATE INDEX idx_audit_tool_calls ON audit_logs USING GIN (tool_calls)
    WHERE tool_calls IS NOT NULL;
CREATE INDEX idx_audit_session ON audit_logs (session_id, created_at DESC)
    WHERE session_id IS NOT NULL;
CREATE INDEX idx_audit_trace ON audit_logs (trace_id, created_at ASC)
    WHERE trace_id IS NOT NULL;
CREATE INDEX idx_audit_error_type ON audit_logs (error_type, created_at DESC)
    WHERE error_type IS NOT NULL;
CREATE INDEX idx_audit_model ON audit_logs (model, created_at DESC)
    WHERE model IS NOT NULL;
CREATE INDEX idx_audit_finish_reason ON audit_logs (finish_reason)
    WHERE finish_reason IS NOT NULL;
