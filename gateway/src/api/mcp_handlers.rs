//! MCP server management API handlers.
//!
//! CRUD operations for MCP server registration, tool listing,
//! connection testing, and cache refresh.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::mcp::registry::{McpServerConfig, McpServerInfo};
use crate::mcp::types::McpToolDef;
use crate::AppState;

// ── Request / Response types ───────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterMcpServerRequest {
    pub name: String,
    pub endpoint: String,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct RegisterMcpServerResponse {
    pub id: Uuid,
    pub name: String,
    pub tool_count: usize,
    pub tools: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct TestMcpServerResponse {
    pub connected: bool,
    pub tool_count: usize,
    pub tools: Vec<McpToolDef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ── Handlers ───────────────────────────────────────────────────

/// POST /api/v1/mcp/servers — Register a new MCP server.
pub async fn register_mcp_server(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterMcpServerRequest>,
) -> Result<(StatusCode, Json<RegisterMcpServerResponse>), (StatusCode, String)> {
    // Validate name (alphanumeric + hyphens only, for safe namespacing)
    if req.name.is_empty() || !req.name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err((StatusCode::BAD_REQUEST, "Name must be alphanumeric (hyphens/underscores allowed)".into()));
    }

    if req.endpoint.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Endpoint URL is required".into()));
    }

    let config = McpServerConfig {
        id: Uuid::new_v4(),
        name: req.name.clone(),
        endpoint: req.endpoint,
        api_key: req.api_key,
    };

    let id = config.id;

    match state.mcp_registry.register(config).await {
        Ok(tools) => {
            let tool_names: Vec<String> = tools.iter().map(|t| t.name.clone()).collect();
            Ok((
                StatusCode::CREATED,
                Json(RegisterMcpServerResponse {
                    id,
                    name: req.name,
                    tool_count: tools.len(),
                    tools: tool_names,
                }),
            ))
        }
        Err(e) => Err((StatusCode::BAD_GATEWAY, format!("Failed to connect to MCP server: {}", e))),
    }
}

/// GET /api/v1/mcp/servers — List all registered MCP servers.
pub async fn list_mcp_servers(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<McpServerInfo>> {
    Json(state.mcp_registry.list_servers().await)
}

/// DELETE /api/v1/mcp/servers/:id — Remove an MCP server.
pub async fn delete_mcp_server(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    if state.mcp_registry.unregister(&id).await {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

/// POST /api/v1/mcp/servers/:id/refresh — Force-refresh tool cache.
pub async fn refresh_mcp_server(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<McpToolDef>>, (StatusCode, String)> {
    match state.mcp_registry.refresh(&id).await {
        Ok(tools) => Ok(Json(tools)),
        Err(e) => Err((StatusCode::BAD_GATEWAY, e)),
    }
}

/// GET /api/v1/mcp/servers/:id/tools — List cached tools for a server.
pub async fn list_mcp_server_tools(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<McpToolDef>>, StatusCode> {
    match state.mcp_registry.get_server_tools(&id).await {
        Some(tools) => Ok(Json(tools)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

/// POST /api/v1/mcp/servers/test — Test connection to an MCP server without registering.
pub async fn test_mcp_server(
    Json(req): Json<RegisterMcpServerRequest>,
) -> Json<TestMcpServerResponse> {
    use crate::mcp::client::McpClient;

    let client = McpClient::new(&req.endpoint, req.api_key);

    match client.initialize().await {
        Ok(_) => match client.list_tools().await {
            Ok(tools) => Json(TestMcpServerResponse {
                connected: true,
                tool_count: tools.len(),
                tools,
                error: None,
            }),
            Err(e) => Json(TestMcpServerResponse {
                connected: true,
                tool_count: 0,
                tools: vec![],
                error: Some(format!("Connected but failed to list tools: {}", e)),
            }),
        },
        Err(e) => Json(TestMcpServerResponse {
            connected: false,
            tool_count: 0,
            tools: vec![],
            error: Some(e),
        }),
    }
}
