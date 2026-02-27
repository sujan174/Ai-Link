//! MCP client — Streamable HTTP transport.
//!
//! Implements the MCP protocol over HTTP(S):
//! - `initialize` handshake
//! - `tools/list` to discover available tools
//! - `tools/call` to execute a tool
//!
//! Uses JSON-RPC 2.0 over HTTP POST as specified by MCP Streamable HTTP transport.

use reqwest::Client;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use super::types::*;

/// MCP client for a single MCP server (Streamable HTTP transport).
pub struct McpClient {
    endpoint: String,
    api_key: Option<String>,
    http: Client,
    request_id: AtomicU64,
    /// Session ID returned by server during initialization (if any).
    session_id: std::sync::Mutex<Option<String>>,
}

impl McpClient {
    /// Create a new MCP client for the given endpoint.
    pub fn new(endpoint: impl Into<String>, api_key: Option<String>) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("failed to build HTTP client");

        Self {
            endpoint: endpoint.into(),
            api_key,
            http,
            request_id: AtomicU64::new(1),
            session_id: std::sync::Mutex::new(None),
        }
    }

    fn next_id(&self) -> u64 {
        self.request_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Send a JSON-RPC request to the MCP server and return the parsed result.
    async fn rpc(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let req = JsonRpcRequest::new(self.next_id(), method, params);

        let mut http_req = self
            .http
            .post(&self.endpoint)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream");

        // Attach API key if configured
        if let Some(key) = &self.api_key {
            http_req = http_req.header("Authorization", format!("Bearer {}", key));
        }

        // Attach session ID if we have one
        if let Ok(guard) = self.session_id.lock() {
            if let Some(sid) = guard.as_ref() {
                http_req = http_req.header("Mcp-Session-Id", sid.clone());
            }
        }

        let resp = http_req
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("MCP request failed: {}", e))?;

        // Capture session ID from response headers
        if let Some(sid) = resp.headers().get("mcp-session-id") {
            if let Ok(sid_str) = sid.to_str() {
                if let Ok(mut guard) = self.session_id.lock() {
                    *guard = Some(sid_str.to_string());
                }
            }
        }

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("MCP server returned {}: {}", status, body));
        }

        // Parse JSON-RPC response
        let body = resp.text().await.map_err(|e| format!("Failed to read MCP response: {}", e))?;
        let rpc_resp: JsonRpcResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Invalid JSON-RPC response: {} (body: {})", e, &body[..body.len().min(200)]))?;

        if let Some(err) = rpc_resp.error {
            return Err(format!("{}", err));
        }

        rpc_resp
            .result
            .ok_or_else(|| "MCP response missing both result and error".to_string())
    }

    /// Perform the MCP `initialize` handshake.
    pub async fn initialize(&self) -> Result<InitializeResult, String> {
        let params = serde_json::to_value(InitializeParams {
            protocol_version: "2025-06-18".to_string(),
            capabilities: ClientCapabilities {},
            client_info: Implementation {
                name: "ailink-gateway".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        })
        .map_err(|e| format!("Failed to serialize initialize params: {}", e))?;

        let result = self.rpc("initialize", Some(params)).await?;
        let init: InitializeResult = serde_json::from_value(result)
            .map_err(|e| format!("Failed to parse initialize result: {}", e))?;

        // Send `initialized` notification (no response expected, but we send it per spec)
        let _ = self.rpc("notifications/initialized", Some(serde_json::json!({}))).await;

        tracing::info!(
            server = ?init.server_info,
            protocol = %init.protocol_version,
            "MCP server initialized"
        );

        Ok(init)
    }

    /// Fetch the list of tools from the MCP server.
    pub async fn list_tools(&self) -> Result<Vec<McpToolDef>, String> {
        let mut all_tools = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let params = match &cursor {
                Some(c) => Some(serde_json::json!({ "cursor": c })),
                None => None,
            };

            let result = self.rpc("tools/list", params).await?;
            let page: ListToolsResult = serde_json::from_value(result)
                .map_err(|e| format!("Failed to parse tools/list result: {}", e))?;

            all_tools.extend(page.tools);

            match page.next_cursor {
                Some(c) if !c.is_empty() => cursor = Some(c),
                _ => break,
            }
        }

        Ok(all_tools)
    }

    /// Execute a tool on the MCP server.
    pub async fn call_tool(
        &self,
        name: &str,
        arguments: Option<Value>,
    ) -> Result<CallToolResult, String> {
        let params = serde_json::to_value(CallToolParams {
            name: name.to_string(),
            arguments,
        })
        .map_err(|e| format!("Failed to serialize call_tool params: {}", e))?;

        let result = self.rpc("tools/call", Some(params)).await?;
        let call_result: CallToolResult = serde_json::from_value(result)
            .map_err(|e| format!("Failed to parse tools/call result: {}", e))?;

        Ok(call_result)
    }

    /// Simple health check — attempts initialization.
    pub async fn health_check(&self) -> Result<(), String> {
        self.initialize().await?;
        Ok(())
    }
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = McpClient::new("http://localhost:3000/mcp", None);
        assert_eq!(client.endpoint, "http://localhost:3000/mcp");
        assert!(client.api_key.is_none());
    }

    #[test]
    fn test_client_with_api_key() {
        let client = McpClient::new("http://example.com/mcp", Some("sk-test".into()));
        assert_eq!(client.api_key.as_deref(), Some("sk-test"));
    }

    #[test]
    fn test_request_id_increments() {
        let client = McpClient::new("http://localhost/mcp", None);
        let id1 = client.next_id();
        let id2 = client.next_id();
        assert_eq!(id2, id1 + 1);
    }
}
