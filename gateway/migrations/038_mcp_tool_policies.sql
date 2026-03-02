-- MCP Per-Token Tool Allow/Deny Lists
-- Adds fine-grained MCP tool access control per virtual key (token).
--
-- Semantics:
--   mcp_allowed_tools = NULL  → all MCP tools permitted (backward compatible)
--   mcp_allowed_tools = []    → NO MCP tools permitted
--   mcp_allowed_tools = ["mcp__slack__*"] → only matching tools (glob)
--   mcp_blocked_tools always takes priority over mcp_allowed_tools

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS mcp_allowed_tools JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mcp_blocked_tools JSONB DEFAULT NULL;

COMMENT ON COLUMN tokens.mcp_allowed_tools IS 'MCP tool allowlist (JSONB string array). NULL = all allowed. Empty = none allowed. Supports glob patterns like mcp__server__*';
COMMENT ON COLUMN tokens.mcp_blocked_tools IS 'MCP tool blocklist (JSONB string array). NULL = none blocked. Takes priority over allowlist. Supports glob patterns.';
