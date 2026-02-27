//! MCP Server Registry — in-memory registry of active MCP connections
//! with cached tool schemas.
//!
//! The registry manages MCP server lifecycles:
//! - Registration (connect + initialize + cache tools)
//! - Tool schema caching and refresh
//! - Tool execution routing

use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::client::McpClient;
use super::types::*;

/// Configuration for registering an MCP server.
#[derive(Debug, Clone)]
pub struct McpServerConfig {
    pub id: Uuid,
    pub name: String,
    pub endpoint: String,
    pub api_key: Option<String>,
}

/// Runtime state for a connected MCP server.
pub struct McpServerState {
    pub config: McpServerConfig,
    pub client: McpClient,
    pub tools: Vec<McpToolDef>,
    pub last_refreshed: std::time::Instant,
    pub status: McpServerStatus,
    pub server_info: Option<Implementation>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum McpServerStatus {
    Connected,
    Disconnected,
    Error(String),
}

/// In-memory registry of active MCP server connections.
pub struct McpRegistry {
    servers: Arc<RwLock<HashMap<Uuid, McpServerState>>>,
    /// Name → ID index for fast lookup by server name.
    name_index: Arc<RwLock<HashMap<String, Uuid>>>,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            name_index: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register and connect to an MCP server.
    ///
    /// Performs the initialize handshake and caches the tool list.
    pub async fn register(&self, config: McpServerConfig) -> Result<Vec<McpToolDef>, String> {
        let client = McpClient::new(&config.endpoint, config.api_key.clone());

        // Initialize
        let init_result = client.initialize().await.map_err(|e| {
            format!("Failed to initialize MCP server '{}': {}", config.name, e)
        })?;

        // Verify server supports tools
        if init_result.capabilities.tools.is_none() {
            return Err(format!(
                "MCP server '{}' does not advertise tools capability",
                config.name
            ));
        }

        // Fetch tools
        let tools = client.list_tools().await.map_err(|e| {
            format!("Failed to list tools from '{}': {}", config.name, e)
        })?;

        tracing::info!(
            server = %config.name,
            tool_count = tools.len(),
            tools = ?tools.iter().map(|t| &t.name).collect::<Vec<_>>(),
            "MCP server registered"
        );

        let id = config.id;
        let name = config.name.clone();
        let tools_clone = tools.clone();

        let state = McpServerState {
            config,
            client,
            tools,
            last_refreshed: std::time::Instant::now(),
            status: McpServerStatus::Connected,
            server_info: init_result.server_info,
        };

        {
            let mut servers = self.servers.write().await;
            servers.insert(id, state);
        }
        {
            let mut index = self.name_index.write().await;
            index.insert(name, id);
        }

        Ok(tools_clone)
    }

    /// Remove an MCP server from the registry.
    pub async fn unregister(&self, id: &Uuid) -> bool {
        let mut servers = self.servers.write().await;
        if let Some(state) = servers.remove(id) {
            let mut index = self.name_index.write().await;
            index.remove(&state.config.name);
            true
        } else {
            false
        }
    }

    /// Refresh the tool cache for a specific server.
    pub async fn refresh(&self, id: &Uuid) -> Result<Vec<McpToolDef>, String> {
        let mut servers = self.servers.write().await;
        let state = servers
            .get_mut(id)
            .ok_or_else(|| format!("MCP server {} not found", id))?;

        match state.client.list_tools().await {
            Ok(tools) => {
                tracing::info!(
                    server = %state.config.name,
                    tool_count = tools.len(),
                    "MCP tools refreshed"
                );
                state.tools = tools.clone();
                state.last_refreshed = std::time::Instant::now();
                state.status = McpServerStatus::Connected;
                Ok(tools)
            }
            Err(e) => {
                state.status = McpServerStatus::Error(e.clone());
                Err(e)
            }
        }
    }

    /// Get merged OpenAI-format tool definitions for a set of server IDs.
    pub async fn get_openai_tools(&self, server_ids: &[Uuid]) -> Vec<Value> {
        let servers = self.servers.read().await;
        let mut tools = Vec::new();

        for id in server_ids {
            if let Some(state) = servers.get(id) {
                if state.status != McpServerStatus::Connected {
                    continue;
                }
                for tool in &state.tools {
                    tools.push(to_openai_function(&state.config.name, tool));
                }
            }
        }

        tools
    }

    /// Get merged OpenAI-format tool definitions by server names.
    pub async fn get_openai_tools_by_name(&self, server_names: &[String]) -> Vec<Value> {
        let index = self.name_index.read().await;
        let ids: Vec<Uuid> = server_names
            .iter()
            .filter_map(|name| index.get(name).copied())
            .collect();
        self.get_openai_tools(&ids).await
    }

    /// Execute a tool call routed by server name.
    pub async fn execute_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: Option<Value>,
    ) -> Result<CallToolResult, String> {
        let server_id = {
            let index = self.name_index.read().await;
            index
                .get(server_name)
                .copied()
                .ok_or_else(|| format!("MCP server '{}' not found", server_name))?
        };

        let servers = self.servers.read().await;
        let state = servers
            .get(&server_id)
            .ok_or_else(|| format!("MCP server '{}' not found in registry", server_name))?;

        if state.status != McpServerStatus::Connected {
            return Err(format!(
                "MCP server '{}' is not connected: {:?}",
                server_name, state.status
            ));
        }

        state.client.call_tool(tool_name, arguments).await
    }

    /// List all registered servers with their status and tool counts.
    pub async fn list_servers(&self) -> Vec<McpServerInfo> {
        let servers = self.servers.read().await;
        servers
            .values()
            .map(|s| McpServerInfo {
                id: s.config.id,
                name: s.config.name.clone(),
                endpoint: s.config.endpoint.clone(),
                status: format!("{:?}", s.status),
                tool_count: s.tools.len(),
                tools: s.tools.iter().map(|t| t.name.clone()).collect(),
                last_refreshed_secs_ago: s.last_refreshed.elapsed().as_secs(),
                server_info: s.server_info.clone(),
            })
            .collect()
    }

    /// Get tools for a specific server.
    pub async fn get_server_tools(&self, id: &Uuid) -> Option<Vec<McpToolDef>> {
        let servers = self.servers.read().await;
        servers.get(id).map(|s| s.tools.clone())
    }

    /// Check if any MCP servers are registered.
    pub async fn has_servers(&self) -> bool {
        let servers = self.servers.read().await;
        !servers.is_empty()
    }

    /// Refresh all connected servers. Called by background task.
    pub async fn refresh_all(&self) {
        let ids: Vec<Uuid> = {
            let servers = self.servers.read().await;
            servers.keys().copied().collect()
        };

        for id in ids {
            if let Err(e) = self.refresh(&id).await {
                tracing::warn!(server_id = %id, error = %e, "Failed to refresh MCP server");
            }
        }
    }
}

/// Serializable server info for API responses.
#[derive(Debug, Clone, serde::Serialize)]
pub struct McpServerInfo {
    pub id: Uuid,
    pub name: String,
    pub endpoint: String,
    pub status: String,
    pub tool_count: usize,
    pub tools: Vec<String>,
    pub last_refreshed_secs_ago: u64,
    pub server_info: Option<Implementation>,
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_registry_creation() {
        let registry = McpRegistry::new();
        assert!(!registry.has_servers().await);
    }

    #[tokio::test]
    async fn test_empty_tools_by_name() {
        let registry = McpRegistry::new();
        let tools = registry.get_openai_tools_by_name(&["nonexistent".to_string()]).await;
        assert!(tools.is_empty());
    }

    #[tokio::test]
    async fn test_execute_tool_unknown_server() {
        let registry = McpRegistry::new();
        let result = registry.execute_tool("nope", "tool", None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_unregister_nonexistent() {
        let registry = McpRegistry::new();
        let removed = registry.unregister(&Uuid::new_v4()).await;
        assert!(!removed);
    }

    #[tokio::test]
    async fn test_list_servers_empty() {
        let registry = McpRegistry::new();
        let servers = registry.list_servers().await;
        assert!(servers.is_empty());
    }
}
