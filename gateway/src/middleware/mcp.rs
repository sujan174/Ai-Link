//! MCP proxy integration — tool injection and tool_call execution loop.
//!
//! Two integration points in the proxy handler:
//! 1. Pre-LLM: `inject_mcp_tools()` — merges MCP tool schemas into the request body
//! 2. Post-LLM: `handle_mcp_tool_calls()` — executes MCP tool calls and continues the conversation

use serde_json::Value;
use std::sync::Arc;

use crate::mcp::registry::McpRegistry;
use crate::mcp::types;

/// Maximum number of tool execution loop iterations to prevent infinite loops.
const MAX_TOOL_LOOP_ITERATIONS: usize = 10;

/// Extract MCP server names from the `X-MCP-Servers` header.
/// Format: comma-separated list of server names, e.g., "slack,jira,brave"
pub fn parse_mcp_header(headers: &axum::http::HeaderMap) -> Vec<String> {
    headers
        .get("x-mcp-servers")
        .and_then(|v| v.to_str().ok())
        .map(|s| {
            s.split(',')
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Pre-LLM: Inject MCP tool schemas into the request body.
///
/// Reads `X-MCP-Servers` header, fetches cached tool schemas from the registry,
/// converts them to OpenAI function-calling format, and merges into `body.tools[]`.
///
/// Returns the modified body bytes if MCP tools were injected, or None if no changes needed.
pub async fn inject_mcp_tools(
    registry: &Arc<McpRegistry>,
    server_names: &[String],
    body: &[u8],
) -> Option<Vec<u8>> {
    if server_names.is_empty() {
        return None;
    }

    let mcp_tools = registry.get_openai_tools_by_name(server_names).await;
    if mcp_tools.is_empty() {
        tracing::warn!(
            servers = ?server_names,
            "MCP servers requested but no tools found — check server registration"
        );
        return None;
    }

    // Parse the request body
    let mut body_json: Value = match serde_json::from_slice(body) {
        Ok(v) => v,
        Err(_) => return None, // Not a JSON body — skip injection
    };

    // Merge MCP tools into the `tools` array
    let existing_tools = body_json
        .get("tools")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    let mut merged = existing_tools;
    merged.extend(mcp_tools.clone());

    body_json["tools"] = Value::Array(merged);

    tracing::info!(
        mcp_tool_count = mcp_tools.len(),
        servers = ?server_names,
        "Injected MCP tools into request"
    );

    serde_json::to_vec(&body_json).ok()
}

/// A single MCP tool call extracted from an LLM response.
#[derive(Debug)]
pub struct PendingMcpCall {
    pub tool_call_id: String,
    pub server_name: String,
    pub tool_name: String,
    pub arguments: Option<Value>,
}

/// Extract MCP tool calls from an LLM response body.
///
/// Inspects OpenAI-format `choices[*].message.tool_calls[*]` and filters
/// for calls matching the `mcp__` namespace prefix.
pub fn extract_mcp_tool_calls(response_body: &Value) -> Vec<PendingMcpCall> {
    let mut calls = Vec::new();

    let choices = match response_body.get("choices").and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return calls,
    };

    for choice in choices {
        let tool_calls = match choice
            .get("message")
            .and_then(|m| m.get("tool_calls"))
            .and_then(|tc| tc.as_array())
        {
            Some(tc) => tc,
            None => continue,
        };

        for tc in tool_calls {
            let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let func_name = tc
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("");

            // Check if this is an MCP tool call
            if let Some((server, tool)) = types::parse_mcp_tool_name(func_name) {
                let args_str = tc
                    .get("function")
                    .and_then(|f| f.get("arguments"))
                    .and_then(|a| a.as_str());

                let arguments = args_str
                    .and_then(|s| serde_json::from_str(s).ok());

                calls.push(PendingMcpCall {
                    tool_call_id: id,
                    server_name: server,
                    tool_name: tool,
                    arguments,
                });
            }
        }
    }

    calls
}

/// Check if an LLM response has `finish_reason == "tool_calls"` and contains MCP calls.
pub fn has_mcp_tool_calls(response_body: &Value) -> bool {
    let choices = match response_body.get("choices").and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return false,
    };

    for choice in choices {
        let finish_reason = choice
            .get("finish_reason")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if finish_reason == "tool_calls" {
            let tool_calls = choice
                .get("message")
                .and_then(|m| m.get("tool_calls"))
                .and_then(|tc| tc.as_array());

            if let Some(tcs) = tool_calls {
                for tc in tcs {
                    let name = tc
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("");
                    if types::parse_mcp_tool_name(name).is_some() {
                        return true;
                    }
                }
            }
        }
    }

    false
}

/// Post-LLM: Execute MCP tool calls and build the continuation messages.
///
/// For each MCP tool call in the response, executes the tool via the registry,
/// and returns the tool result messages to append to the conversation.
///
/// Returns `Some(Vec<messages>)` with the assistant message + tool results if
/// MCP calls were executed, or `None` if no MCP calls were found.
pub async fn execute_mcp_tool_calls(
    registry: &Arc<McpRegistry>,
    response_body: &Value,
) -> Option<Vec<Value>> {
    let mcp_calls = extract_mcp_tool_calls(response_body);
    if mcp_calls.is_empty() {
        return None;
    }

    // Extract the assistant message (with tool_calls) to include in continuation
    let assistant_msg = response_body
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .cloned();

    let mut result_messages = Vec::new();

    // Add the assistant's tool_calls message
    if let Some(msg) = assistant_msg {
        result_messages.push(msg);
    }

    // Execute each MCP tool call
    for call in &mcp_calls {
        tracing::info!(
            server = %call.server_name,
            tool = %call.tool_name,
            "Executing MCP tool call"
        );

        let result = registry
            .execute_tool(&call.server_name, &call.tool_name, call.arguments.clone())
            .await;

        let content = match result {
            Ok(tool_result) => types::mcp_result_to_text(&tool_result),
            Err(e) => {
                tracing::warn!(
                    server = %call.server_name,
                    tool = %call.tool_name,
                    error = %e,
                    "MCP tool call failed"
                );
                format!("Error executing tool: {}", e)
            }
        };

        // Build OpenAI tool result message
        result_messages.push(serde_json::json!({
            "role": "tool",
            "tool_call_id": call.tool_call_id,
            "content": content,
        }));
    }

    tracing::info!(
        mcp_calls_executed = mcp_calls.len(),
        "MCP tool execution complete"
    );

    Some(result_messages)
}

/// Build a continuation request body by appending tool result messages
/// to the original request's messages array.
pub fn build_continuation_body(
    original_request_body: &Value,
    new_messages: &[Value],
) -> Option<Vec<u8>> {
    let mut body = original_request_body.clone();

    let messages = body
        .get_mut("messages")
        .and_then(|m| m.as_array_mut())?;

    messages.extend(new_messages.iter().cloned());

    serde_json::to_vec(&body).ok()
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_mcp_header() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("x-mcp-servers", "slack,jira,brave".parse().unwrap());
        let names = parse_mcp_header(&headers);
        assert_eq!(names, vec!["slack", "jira", "brave"]);
    }

    #[test]
    fn test_parse_mcp_header_empty() {
        let headers = axum::http::HeaderMap::new();
        let names = parse_mcp_header(&headers);
        assert!(names.is_empty());
    }

    #[test]
    fn test_parse_mcp_header_whitespace() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("x-mcp-servers", " slack , jira ".parse().unwrap());
        let names = parse_mcp_header(&headers);
        assert_eq!(names, vec!["slack", "jira"]);
    }

    #[test]
    fn test_extract_mcp_tool_calls() {
        let response = serde_json::json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "mcp__slack__send_message",
                                "arguments": "{\"channel\": \"general\", \"text\": \"hello\"}"
                            }
                        },
                        {
                            "id": "call_2",
                            "type": "function",
                            "function": {
                                "name": "get_weather",
                                "arguments": "{\"city\": \"NYC\"}"
                            }
                        }
                    ]
                },
                "finish_reason": "tool_calls"
            }]
        });

        let calls = extract_mcp_tool_calls(&response);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].server_name, "slack");
        assert_eq!(calls[0].tool_name, "send_message");
        assert_eq!(calls[0].tool_call_id, "call_1");
        assert!(calls[0].arguments.is_some());
    }

    #[test]
    fn test_has_mcp_tool_calls_true() {
        let response = serde_json::json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "function": { "name": "mcp__brave__search" }
                    }]
                },
                "finish_reason": "tool_calls"
            }]
        });
        assert!(has_mcp_tool_calls(&response));
    }

    #[test]
    fn test_has_mcp_tool_calls_false_non_mcp() {
        let response = serde_json::json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "function": { "name": "get_weather" }
                    }]
                },
                "finish_reason": "tool_calls"
            }]
        });
        assert!(!has_mcp_tool_calls(&response));
    }

    #[test]
    fn test_has_mcp_tool_calls_false_no_tool_calls() {
        let response = serde_json::json!({
            "choices": [{
                "message": { "role": "assistant", "content": "Hello!" },
                "finish_reason": "stop"
            }]
        });
        assert!(!has_mcp_tool_calls(&response));
    }

    #[test]
    fn test_build_continuation_body() {
        let original = serde_json::json!({
            "model": "gpt-4o",
            "messages": [
                { "role": "user", "content": "Search for Rust docs" }
            ],
            "tools": [
                { "type": "function", "function": { "name": "mcp__brave__search" } }
            ]
        });

        let new_messages = vec![
            serde_json::json!({
                "role": "assistant",
                "tool_calls": [{
                    "id": "call_1",
                    "function": { "name": "mcp__brave__search", "arguments": "{\"query\": \"rust\"}" }
                }]
            }),
            serde_json::json!({
                "role": "tool",
                "tool_call_id": "call_1",
                "content": "Rust is a systems programming language..."
            }),
        ];

        let result = build_continuation_body(&original, &new_messages).unwrap();
        let parsed: Value = serde_json::from_slice(&result).unwrap();
        let messages = parsed["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 3); // original user + assistant + tool result
    }
}
