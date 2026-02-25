use serde_json::{json, Value};

/// Supported LLM providers for request/response translation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    OpenAI,
    /// Azure OpenAI Service — same JSON format as OpenAI, different URL structure + api-key header.
    AzureOpenAI,
    Anthropic,
    Gemini,
    /// Groq — OpenAI-compatible API at api.groq.com
    Groq,
    /// Mistral AI — OpenAI-compatible API at api.mistral.ai
    Mistral,
    /// Cohere — Command-R models via api.cohere.com (OpenAI-compatible endpoint)
    Cohere,
    /// Ollama — local OpenAI-compatible server (default: http://localhost:11434)
    Ollama,
    Unknown,
}

/// Detect the provider from the model name or upstream URL.
///
/// Fast path: dispatch on the first ASCII byte of the model name (zero
/// allocation), then do a single case-insensitive prefix check.  Only falls
/// through to the URL scan when the model string is empty or unrecognised.
pub fn detect_provider(model: &str, upstream_url: &str) -> Provider {
    // ── Fast path: first-byte dispatch (no allocation) ───────────────────
    if let Some(first) = model.bytes().next() {
        match first.to_ascii_lowercase() {
            // 'c' → claude-*
            b'c' if starts_with_ignore_ascii_case(model, "claude") => {
                return Provider::Anthropic;
            }
            // 'g' → gemini-* or gpt-*
            b'g' => {
                if starts_with_ignore_ascii_case(model, "gemini") {
                    return Provider::Gemini;
                }
                if starts_with_ignore_ascii_case(model, "gpt") {
                    return Provider::OpenAI;
                }
            }
            // 'o' → o1-* / o3-* / o4-*
            b'o' => {
                if model.len() >= 2 {
                    let second = model.as_bytes()[1].to_ascii_lowercase();
                    if matches!(second, b'1' | b'3' | b'4') {
                        return Provider::OpenAI;
                    }
                }
            }
            // 't' → text-* / tts-*
            b't' => {
                if starts_with_ignore_ascii_case(model, "text-")
                    || starts_with_ignore_ascii_case(model, "tts")
                {
                    return Provider::OpenAI;
                }
            }
            // 'd' → dall-e-*
            b'd' if starts_with_ignore_ascii_case(model, "dall-e") => {
                return Provider::OpenAI;
            }
            // 'w' → whisper-*
            b'w' if starts_with_ignore_ascii_case(model, "whisper") => {
                return Provider::OpenAI;
            }
            _ => {}
        }
    }

    // ── URL-based fallback (only reached for empty/unknown model names) ──
    let url_lower = upstream_url.to_lowercase();
    if url_lower.contains("anthropic") {
        return Provider::Anthropic;
    }
    if url_lower.contains("generativelanguage.googleapis.com")
        || url_lower.contains("aiplatform.googleapis.com")
    {
        return Provider::Gemini;
    }
    // Azure OpenAI: detect by endpoint URL patterns
    if url_lower.contains("azure.com") && url_lower.contains("openai")
        || url_lower.contains(".openai.azure.com")
        || url_lower.contains("azure-api.net")
    {
        return Provider::AzureOpenAI;
    }
    if url_lower.contains("groq.com") {
        return Provider::Groq;
    }
    if url_lower.contains("mistral.ai") {
        return Provider::Mistral;
    }
    if url_lower.contains("cohere.com") || url_lower.contains("cohere.ai") {
        return Provider::Cohere;
    }
    if url_lower.contains("localhost:11434")
        || url_lower.contains("ollama")
        || url_lower.contains(":11434")
    {
        return Provider::Ollama;
    }
    if url_lower.contains("openai") {
        return Provider::OpenAI;
    }

    Provider::Unknown
}

/// Case-insensitive ASCII prefix check without allocating.
#[inline(always)]
fn starts_with_ignore_ascii_case(s: &str, prefix: &str) -> bool {
    s.len() >= prefix.len()
        && s.as_bytes()[..prefix.len()]
            .eq_ignore_ascii_case(prefix.as_bytes())
}

/// Translate an OpenAI-format request body into the provider's native format.
/// Returns `None` if no translation is needed (i.e., OpenAI, AzureOpenAI, or Unknown).
pub fn translate_request(provider: Provider, body: &Value) -> Option<Value> {
    match provider {
        Provider::Anthropic => Some(openai_to_anthropic_request(body)),
        Provider::Gemini => Some(openai_to_gemini_request(body)),
        // OpenAI-compatible providers — no translation needed
        Provider::OpenAI
        | Provider::AzureOpenAI
        | Provider::Groq
        | Provider::Mistral
        | Provider::Cohere
        | Provider::Ollama
        | Provider::Unknown => None,
    }
}

/// Translate a provider's native response body back to OpenAI format.
/// Returns `None` if no translation is needed.
pub fn translate_response(provider: Provider, body: &Value, model: &str) -> Option<Value> {
    match provider {
        Provider::Anthropic => Some(anthropic_to_openai_response(body, model)),
        Provider::Gemini => Some(gemini_to_openai_response(body, model)),
        // OpenAI-compatible providers — no translation needed
        Provider::OpenAI
        | Provider::AzureOpenAI
        | Provider::Groq
        | Provider::Mistral
        | Provider::Cohere
        | Provider::Ollama
        | Provider::Unknown => None,
    }
}

/// Rewrite the upstream URL for the given provider and model.
///
/// For Azure OpenAI, the URL format is:
///   {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=2024-05-01-preview
///
/// The `base_url` for Azure should be set to the endpoint root, e.g.:
///   https://my-resource.openai.azure.com
/// The `model` field should be the deployment name.
///
/// `is_streaming` is used to select the correct Gemini endpoint:
///   - false → `:generateContent`
///   - true  → `:streamGenerateContent`
pub fn rewrite_upstream_url(provider: Provider, base_url: &str, model: &str, is_streaming: bool) -> String {
    // Strip the proxy path if the router attached it (e.g. AILink added /v1/chat/completions)
    let sanitized_base = base_url
        .strip_suffix("/v1/chat/completions")
        .unwrap_or(base_url)
        .trim_end_matches('/');

    match provider {
        Provider::Gemini => {
            // Gemini uses different endpoints for streaming vs non-streaming
            let method = if is_streaming { "streamGenerateContent" } else { "generateContent" };
            format!("{}/v1beta/models/{}:{}", sanitized_base, model, method)
        }
        Provider::Anthropic => {
            // Anthropic API: POST https://api.anthropic.com/v1/messages
            format!("{}/v1/messages", sanitized_base)
        }
        Provider::AzureOpenAI => {
            // Azure OpenAI: {endpoint}/openai/deployments/{deployment}/chat/completions
            if sanitized_base.to_lowercase().contains("/openai/deployments/") {
                sanitized_base.to_string()
            } else {
                format!("{}/openai/deployments/{}/chat/completions?api-version=2024-05-01-preview", sanitized_base, model)
            }
        }
        Provider::Ollama => {
            // Ollama: http://localhost:11434/api/chat (or /v1/chat/completions for OpenAI compat mode)
            if sanitized_base.contains("/v1") || sanitized_base.contains("/api/") {
                sanitized_base.to_string()
            } else {
                format!("{}/v1/chat/completions", sanitized_base)
            }
        }
        // Groq, Mistral, Cohere all use standard /v1/chat/completions via their base URLs
        Provider::Groq | Provider::Mistral | Provider::Cohere => {
            if sanitized_base.contains("/v1") {
                sanitized_base.to_string()
            } else {
                format!("{}/v1/chat/completions", sanitized_base)
            }
        }
        _ => base_url.to_string(),
    }
}

/// Inject provider-specific required headers that the upstream API mandates.
///
/// Called after credential injection in the proxy handler, before sending the upstream request.
/// Uses `entry().or_insert()` so existing headers (e.g. from policy Transform actions) are
/// never overwritten — the policy always wins.
pub fn inject_provider_headers(
    provider: Provider,
    headers: &mut reqwest::header::HeaderMap,
    is_streaming: bool,
) {
    use reqwest::header::{HeaderName, HeaderValue};
    match provider {
        Provider::Anthropic => {
            // Required on every Anthropic request (entry().or_insert so policy-set header wins)
            headers
                .entry(HeaderName::from_static("anthropic-version"))
                .or_insert(HeaderValue::from_static("2023-06-01"));
            // Streaming requires explicit Accept header
            if is_streaming {
                headers
                    .entry(reqwest::header::ACCEPT)
                    .or_insert(HeaderValue::from_static("text/event-stream"));
            }
        }
        Provider::Gemini => {
            // Gemini SSE streaming needs Accept: text/event-stream
            if is_streaming {
                headers
                    .entry(reqwest::header::ACCEPT)
                    .or_insert(HeaderValue::from_static("text/event-stream"));
            }
        }
        _ => {}
    }
}

// ═══════════════════════════════════════════════════════════════
// OpenAI → Anthropic (Messages API)
// ═══════════════════════════════════════════════════════════════

fn openai_to_anthropic_request(body: &Value) -> Value {
    let mut result = serde_json::Map::new();

    // Model (required)
    if let Some(model) = body.get("model") {
        result.insert("model".into(), model.clone());
    }

    // Max tokens (required by Anthropic, default 4096)
    let max_tokens = body.get("max_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(4096);
    result.insert("max_tokens".into(), json!(max_tokens));

    // Messages: extract system message as top-level param
    if let Some(messages) = body.get("messages").and_then(|m| m.as_array()) {
        let mut system_parts = Vec::new();
        let mut user_messages = Vec::new();

        for msg in messages {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");
            match role {
                "system" => {
                    if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
                        system_parts.push(content.to_string());
                    }
                }
                "user" | "assistant" => {
                    let mut new_msg = serde_json::Map::new();
                    new_msg.insert("role".into(), json!(role));

                    // Handle content (string or array of content blocks)
                    if let Some(content) = msg.get("content") {
                        if content.is_string() {
                            new_msg.insert("content".into(), content.clone());
                        } else if content.is_array() {
                            // Convert OpenAI content parts to Anthropic format
                            let parts = content.as_array().unwrap();
                            let anthropic_parts: Vec<Value> = parts.iter().map(|p| {
                                let part_type = p.get("type").and_then(|t| t.as_str()).unwrap_or("text");
                                match part_type {
                                    "text" => json!({
                                        "type": "text",
                                        "text": p.get("text").cloned().unwrap_or(json!(""))
                                    }),
                                    "image_url" => {
                                        // Anthropic wants base64 source blocks
                                        let url = p.get("image_url")
                                            .and_then(|u| u.get("url"))
                                            .and_then(|u| u.as_str())
                                            .unwrap_or("");
                                        json!({
                                            "type": "image",
                                            "source": {
                                                "type": "url",
                                                "url": url
                                            }
                                        })
                                    }
                                    _ => p.clone(),
                                }
                            }).collect();
                            new_msg.insert("content".into(), json!(anthropic_parts));
                        }
                    }

                    user_messages.push(Value::Object(new_msg));
                }
                "tool" => {
                    // Tool results: OpenAI → Anthropic
                    user_messages.push(json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": msg.get("tool_call_id").cloned().unwrap_or(json!("")),
                            "content": msg.get("content").cloned().unwrap_or(json!(""))
                        }]
                    }));
                }
                _ => {
                    user_messages.push(msg.clone());
                }
            }
        }

        if !system_parts.is_empty() {
            result.insert("system".into(), json!(system_parts.join("\n")));
        }
        result.insert("messages".into(), json!(user_messages));
    }

    // Temperature
    if let Some(temp) = body.get("temperature") {
        result.insert("temperature".into(), temp.clone());
    }

    // Top P
    if let Some(top_p) = body.get("top_p") {
        result.insert("top_p".into(), top_p.clone());
    }

    // Stop sequences
    if let Some(stop) = body.get("stop") {
        if let Some(arr) = stop.as_array() {
            result.insert("stop_sequences".into(), json!(arr));
        } else if let Some(s) = stop.as_str() {
            result.insert("stop_sequences".into(), json!([s]));
        }
    }

    // Tools
    if let Some(tools) = body.get("tools").and_then(|t| t.as_array()) {
        let anthropic_tools: Vec<Value> = tools.iter().filter_map(|tool| {
            let func = tool.get("function")?;
            Some(json!({
                "name": func.get("name").cloned().unwrap_or(json!("")),
                "description": func.get("description").cloned().unwrap_or(json!("")),
                "input_schema": func.get("parameters").cloned().unwrap_or(json!({"type": "object"}))
            }))
        }).collect();
        if !anthropic_tools.is_empty() {
            result.insert("tools".into(), json!(anthropic_tools));
        }
    }

    // tool_choice: map OpenAI → Anthropic format
    // OpenAI: "auto" | "none" | "required" | {"type":"function","function":{"name":"X"}}
    // Anthropic: {"type":"auto"} | {"type":"any"} | {"type":"tool","name":"X"}
    if let Some(tc) = body.get("tool_choice") {
        match tc.as_str() {
            Some("auto")     => { result.insert("tool_choice".into(), json!({"type": "auto"})); }
            Some("required") => { result.insert("tool_choice".into(), json!({"type": "any"})); }
            Some("none")     => { /* Anthropic has no "none" — omit tool_choice and tools */ }
            None if tc.is_object() => {
                // Specific function: forward as Anthropic "tool" type
                if let Some(name) = tc.get("function").and_then(|f| f.get("name")) {
                    result.insert("tool_choice".into(), json!({"type": "tool", "name": name}));
                }
            }
            _ => {}
        }
    }

    // Stream
    if let Some(stream) = body.get("stream") {
        result.insert("stream".into(), stream.clone());
    }

    // Top K (Anthropic native, no OpenAI equivalent — forward if present)
    if let Some(top_k) = body.get("top_k") {
        result.insert("top_k".into(), top_k.clone());
    }

    // Metadata (for user tracking)
    if let Some(metadata) = body.get("metadata") {
        result.insert("metadata".into(), metadata.clone());
    }

    Value::Object(result)
}

fn anthropic_to_openai_response(body: &Value, model: &str) -> Value {
    let content_text = body.get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| {
            arr.iter().find(|block| {
                block.get("type").and_then(|t| t.as_str()) == Some("text")
            })
        })
        .and_then(|block| block.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("");

    // Extract tool calls
    let tool_calls: Vec<Value> = body.get("content")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|block| block.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
                .map(|block| json!({
                    "id": block.get("id").cloned().unwrap_or(json!("")),
                    "type": "function",
                    "function": {
                        "name": block.get("name").cloned().unwrap_or(json!("")),
                        "arguments": block.get("input")
                            .map(|v| serde_json::to_string(v).unwrap_or_default())
                            .unwrap_or_default()
                    }
                }))
                .collect()
        })
        .unwrap_or_default();

    let finish_reason = match body.get("stop_reason").and_then(|s| s.as_str()) {
        Some("end_turn") => "stop",
        Some("tool_use") => "tool_calls",
        Some("max_tokens") => "length",
        Some("stop_sequence") => "stop",
        _ => "stop",
    };

    let mut message = json!({
        "role": "assistant",
        "content": content_text,
    });
    if !tool_calls.is_empty() {
        message["tool_calls"] = json!(tool_calls);
    }

    let input_tokens = body.get("usage")
        .and_then(|u| u.get("input_tokens"))
        .and_then(|t| t.as_u64())
        .unwrap_or(0);
    let output_tokens = body.get("usage")
        .and_then(|u| u.get("output_tokens"))
        .and_then(|t| t.as_u64())
        .unwrap_or(0);

    json!({
        "id": body.get("id").cloned().unwrap_or(json!("msg_unknown")),
        "object": "chat.completion",
        "created": chrono::Utc::now().timestamp(),
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason
        }],
        "usage": {
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens
        }
    })
}

// ═══════════════════════════════════════════════════════════════
// OpenAI → Gemini (generateContent API)
// ═══════════════════════════════════════════════════════════════

/// Translate an OpenAI content value (string or parts array) into Gemini `parts`.
/// Handles text, image_url (HTTP URLs → fileData, base64 data URIs → inlineData).
fn translate_content_to_gemini_parts(content: Option<&Value>) -> Vec<Value> {
    match content {
        Some(Value::String(s)) => vec![json!({"text": s})],
        Some(Value::Array(parts)) => parts.iter().map(|p| {
            match p.get("type").and_then(|t| t.as_str()) {
                Some("text") => json!({"text": p.get("text").cloned().unwrap_or(json!(""))}),
                Some("image_url") => {
                    let url = p.get("image_url")
                        .and_then(|u| u.get("url"))
                        .and_then(|u| u.as_str())
                        .unwrap_or("");
                    if url.starts_with("data:") {
                        // data:image/jpeg;base64,<data> → Gemini inlineData
                        let mime = url.split(';').next()
                            .and_then(|s| s.strip_prefix("data:"))
                            .unwrap_or("image/jpeg");
                        let data = url.splitn(2, ',').nth(1).unwrap_or("");
                        json!({"inlineData": {"mimeType": mime, "data": data}})
                    } else {
                        // HTTP URL → Gemini fileData
                        // Gemini requires MIME type; try to infer from URL extension
                        let mime = if url.ends_with(".png") { "image/png" }
                            else if url.ends_with(".gif") { "image/gif" }
                            else if url.ends_with(".webp") { "image/webp" }
                            else { "image/jpeg" };
                        json!({"fileData": {"mimeType": mime, "fileUri": url}})
                    }
                }
                _ => p.clone(),
            }
        }).collect(),
        Some(Value::Null) | None => vec![json!({"text": ""})],
        // Fallback: not a known content type, skip
        _ => vec![],
    }
}

fn openai_to_gemini_request(body: &Value) -> Value {
    let mut result = serde_json::Map::new();

    // Messages → contents (with full multimodal support)
    if let Some(messages) = body.get("messages").and_then(|m| m.as_array()) {
        let mut contents = Vec::new();
        let mut system_instruction = None;

        for msg in messages {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");

            match role {
                "system" => {
                    // Gemini system instruction — always text
                    let text = msg.get("content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    system_instruction = Some(json!({
                        "parts": [{"text": text}]
                    }));
                }
                "user" => {
                    let parts = translate_content_to_gemini_parts(msg.get("content"));
                    if !parts.is_empty() {
                        contents.push(json!({ "role": "user", "parts": parts }));
                    }
                }
                "assistant" => {
                    let parts = translate_content_to_gemini_parts(msg.get("content"));
                    if !parts.is_empty() {
                        contents.push(json!({ "role": "model", "parts": parts }));
                    }
                }
                "tool" => {
                    // Function result → Gemini functionResponse
                    let tool_call_id = msg.get("tool_call_id")
                        .and_then(|t| t.as_str())
                        .unwrap_or("unknown");
                    let content_val = msg.get("content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    contents.push(json!({
                        "role": "user",
                        "parts": [{
                            "functionResponse": {
                                "name": tool_call_id,
                                "response": { "result": content_val }
                            }
                        }]
                    }));
                }
                _ => {}
            }
        }

        result.insert("contents".into(), json!(contents));
        if let Some(si) = system_instruction {
            result.insert("systemInstruction".into(), si);
        }
    }

    // Generation config (temperature, max tokens, top_p, stop sequences)
    let mut gen_config = serde_json::Map::new();
    if let Some(temp) = body.get("temperature") {
        gen_config.insert("temperature".into(), temp.clone());
    }
    if let Some(max_tokens) = body.get("max_tokens") {
        gen_config.insert("maxOutputTokens".into(), max_tokens.clone());
    }
    if let Some(top_p) = body.get("top_p") {
        gen_config.insert("topP".into(), top_p.clone());
    }
    if let Some(stop) = body.get("stop") {
        if let Some(arr) = stop.as_array() {
            gen_config.insert("stopSequences".into(), json!(arr));
        } else if let Some(s) = stop.as_str() {
            gen_config.insert("stopSequences".into(), json!([s]));
        }
    }

    // response_format → Gemini responseMimeType + responseSchema
    // OpenAI: {"type":"json_object"} | {"type":"json_schema","json_schema":{"schema":{...}}}
    if let Some(rf) = body.get("response_format") {
        match rf.get("type").and_then(|t| t.as_str()) {
            Some("json_object") => {
                gen_config.insert("responseMimeType".into(), json!("application/json"));
            }
            Some("json_schema") => {
                gen_config.insert("responseMimeType".into(), json!("application/json"));
                // json_schema.schema contains the JSON Schema object
                if let Some(schema) = rf.get("json_schema").and_then(|s| s.get("schema")) {
                    gen_config.insert("responseSchema".into(), schema.clone());
                }
            }
            _ => {}
        }
    }

    if !gen_config.is_empty() {
        result.insert("generationConfig".into(), Value::Object(gen_config));
    }

    // Tools (OpenAI functions → Gemini functionDeclarations)
    if let Some(tools) = body.get("tools").and_then(|t| t.as_array()) {
        let function_declarations: Vec<Value> = tools.iter().filter_map(|tool| {
            let func = tool.get("function")?;
            Some(json!({
                "name": func.get("name").cloned().unwrap_or(json!("")),
                "description": func.get("description").cloned().unwrap_or(json!("")),
                "parameters": func.get("parameters").cloned().unwrap_or(json!({"type": "object"}))
            }))
        }).collect();
        if !function_declarations.is_empty() {
            result.insert("tools".into(), json!([{
                "functionDeclarations": function_declarations
            }]));
        }
    }

    // tool_choice → Gemini toolConfig.functionCallingConfig
    // OpenAI: "auto" | "none" | "required" | {"type":"function","function":{"name":"X"}}
    // Gemini mode: AUTO | NONE | ANY | specific function via allowedFunctionNames
    if let Some(tc) = body.get("tool_choice") {
        let (mode, allowed_names): (&str, Vec<&str>) = match tc.as_str() {
            Some("auto")     => ("AUTO", vec![]),
            Some("none")     => ("NONE", vec![]),
            Some("required") => ("ANY",  vec![]),
            _ => {
                // Specific function: {"type":"function","function":{"name":"X"}}
                if let Some(name) = tc.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str()) {
                    ("ANY", vec![name])
                } else {
                    ("AUTO", vec![])
                }
            }
        };
        let mut fc_config = json!({"mode": mode});
        if !allowed_names.is_empty() {
            fc_config["allowedFunctionNames"] = json!(allowed_names);
        }
        result.insert("toolConfig".into(), json!({"functionCallingConfig": fc_config}));
    }

    Value::Object(result)
}

fn gemini_to_openai_response(body: &Value, model: &str) -> Value {
    // Extract text from candidates[0].content.parts[0].text
    let candidates = body.get("candidates").and_then(|c| c.as_array());

    let (content_text, finish_reason, tool_calls) = if let Some(candidates) = candidates {
        if let Some(candidate) = candidates.first() {
            let text = candidate.get("content")
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
                .and_then(|parts| {
                    parts.iter().find(|p| p.get("text").is_some())
                })
                .and_then(|p| p.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("");

            // Extract tool calls from function_call parts
            let tools: Vec<Value> = candidate.get("content")
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
                .map(|parts| {
                    parts.iter()
                        .filter_map(|p| p.get("functionCall"))
                        .enumerate()
                        .map(|(i, fc)| json!({
                            "id": format!("call_{}", i),
                            "type": "function",
                            "function": {
                                "name": fc.get("name").cloned().unwrap_or(json!("")),
                                "arguments": fc.get("args")
                                    .map(|v| serde_json::to_string(v).unwrap_or_default())
                                    .unwrap_or_default()
                            }
                        }))
                        .collect()
                })
                .unwrap_or_default();

            let reason = match candidate.get("finishReason").and_then(|f| f.as_str()) {
                Some("STOP") => "stop",
                Some("MAX_TOKENS") => "length",
                Some("SAFETY") => "content_filter",
                Some("RECITATION") => "content_filter",
                _ => "stop",
            };

            (text.to_string(), reason, tools)
        } else {
            (String::new(), "stop", Vec::new())
        }
    } else {
        (String::new(), "stop", Vec::new())
    };

    let mut message = json!({
        "role": "assistant",
        "content": content_text,
    });
    if !tool_calls.is_empty() {
        message["tool_calls"] = json!(tool_calls);
    }

    let prompt_tokens = body.get("usageMetadata")
        .and_then(|u| u.get("promptTokenCount"))
        .and_then(|t| t.as_u64())
        .unwrap_or(0);
    let completion_tokens = body.get("usageMetadata")
        .and_then(|u| u.get("candidatesTokenCount"))
        .and_then(|t| t.as_u64())
        .unwrap_or(0);

    json!({
        "id": format!("chatcmpl-{}", uuid::Uuid::new_v4()),
        "object": "chat.completion",
        "created": chrono::Utc::now().timestamp(),
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason
        }],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens
        }
    })
}

// ═══════════════════════════════════════════════════════════════
// SSE Stream Translation (Anthropic/Gemini → OpenAI delta format)
// ═══════════════════════════════════════════════════════════════

/// Translate an entire SSE response body from a non-OpenAI provider
/// into OpenAI-compatible `chat.completion.chunk` SSE events.
/// Returns `None` if no translation is needed (OpenAI/Unknown).
pub fn translate_sse_body(provider: Provider, body: &[u8], model: &str) -> Option<Vec<u8>> {
    match provider {
        Provider::Anthropic => Some(translate_anthropic_sse_to_openai(body, model)),
        Provider::Gemini => Some(translate_gemini_sse_to_openai(body, model)),
        // OpenAI-compatible providers — no SSE translation needed
        Provider::OpenAI
        | Provider::AzureOpenAI
        | Provider::Groq
        | Provider::Mistral
        | Provider::Cohere
        | Provider::Ollama
        | Provider::Unknown => None,
    }
}

/// Generate an OpenAI-format SSE chunk line.
fn openai_sse_chunk(
    chunk_id: &str,
    model: &str,
    delta: Value,
    finish_reason: Option<&str>,
) -> String {
    let chunk = json!({
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": chrono::Utc::now().timestamp(),
        "model": model,
        "choices": [{
            "index": 0,
            "delta": delta,
            "finish_reason": finish_reason,
        }]
    });
    format!("data: {}\n\n", serde_json::to_string(&chunk).unwrap_or_default())
}

// ── Anthropic SSE → OpenAI SSE ──────────────────────────────────

fn translate_anthropic_sse_to_openai(body: &[u8], model: &str) -> Vec<u8> {
    let body_str = String::from_utf8_lossy(body);
    let chunk_id = format!("chatcmpl-{}", uuid::Uuid::new_v4().simple());
    let mut output = String::new();
    let mut sent_role = false;

    // Anthropic SSE has two relevant line types:
    // `event: <type>` followed by `data: <json>`
    // We track current event type and process data lines.
    let mut current_event_type: Option<String> = None;

    for line in body_str.lines() {
        let line = line.trim();

        if line.is_empty() {
            current_event_type = None;
            continue;
        }

        // Track event type
        if let Some(event_type) = line.strip_prefix("event: ") {
            current_event_type = Some(event_type.trim().to_string());
            continue;
        }

        // Process data lines
        let data = if let Some(stripped) = line.strip_prefix("data: ") {
            stripped.trim()
        } else if let Some(stripped) = line.strip_prefix("data:") {
            stripped.trim()
        } else {
            continue;
        };

        if data == "[DONE]" {
            output.push_str("data: [DONE]\n\n");
            continue;
        }

        let json: Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = current_event_type
            .as_deref()
            .or_else(|| json.get("type").and_then(|t| t.as_str()))
            .unwrap_or("");

        match event_type {
            "message_start" => {
                // Emit role chunk
                if !sent_role {
                    output.push_str(&openai_sse_chunk(
                        &chunk_id, model,
                        json!({"role": "assistant", "content": ""}),
                        None,
                    ));
                    sent_role = true;
                }
            }
            "content_block_delta" => {
                if let Some(delta) = json.get("delta") {
                    // Text delta
                    if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                        output.push_str(&openai_sse_chunk(
                            &chunk_id, model,
                            json!({"content": text}),
                            None,
                        ));
                    }
                    // Tool input delta
                    if let Some(partial) = delta.get("partial_json").and_then(|p| p.as_str()) {
                        let index = json.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                        output.push_str(&openai_sse_chunk(
                            &chunk_id, model,
                            json!({"tool_calls": [{"index": index, "function": {"arguments": partial}}]}),
                            None,
                        ));
                    }
                }
            }
            "content_block_start" => {
                // Tool use start → emit tool call header
                if let Some(cb) = json.get("content_block") {
                    if cb.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                        let index = json.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                        let name = cb.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let call_id = cb.get("id").and_then(|id| id.as_str()).unwrap_or("");
                        output.push_str(&openai_sse_chunk(
                            &chunk_id, model,
                            json!({"tool_calls": [{
                                "index": index,
                                "id": call_id,
                                "type": "function",
                                "function": {"name": name, "arguments": ""}
                            }]}),
                            None,
                        ));
                    }
                }
            }
            "message_delta" => {
                // Map stop_reason → finish_reason
                let stop = json.get("delta")
                    .and_then(|d| d.get("stop_reason"))
                    .and_then(|s| s.as_str());
                let finish = match stop {
                    Some("end_turn") => Some("stop"),
                    Some("tool_use") => Some("tool_calls"),
                    Some("max_tokens") => Some("length"),
                    Some("stop_sequence") => Some("stop"),
                    _ => None,
                };
                if let Some(fr) = finish {
                    output.push_str(&openai_sse_chunk(
                        &chunk_id, model,
                        json!({}),
                        Some(fr),
                    ));
                }
            }
            "message_stop" => {
                output.push_str("data: [DONE]\n\n");
            }
            _ => {}
        }
    }

    output.into_bytes()
}

// ── Gemini SSE → OpenAI SSE ─────────────────────────────────────

fn translate_gemini_sse_to_openai(body: &[u8], model: &str) -> Vec<u8> {
    let body_str = String::from_utf8_lossy(body);
    let chunk_id = format!("chatcmpl-{}", uuid::Uuid::new_v4().simple());
    let mut output = String::new();
    let mut sent_role = false;

    for line in body_str.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let data = if let Some(stripped) = line.strip_prefix("data: ") {
            stripped.trim()
        } else if let Some(stripped) = line.strip_prefix("data:") {
            stripped.trim()
        } else {
            continue;
        };

        if data == "[DONE]" {
            output.push_str("data: [DONE]\n\n");
            continue;
        }

        let json: Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Emit role on first chunk
        if !sent_role {
            output.push_str(&openai_sse_chunk(
                &chunk_id, model,
                json!({"role": "assistant", "content": ""}),
                None,
            ));
            sent_role = true;
        }

        // Extract text from candidates[0].content.parts
        if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array()) {
            if let Some(candidate) = candidates.first() {
                let parts = candidate.get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array());

                if let Some(parts) = parts {
                    for part in parts {
                        // Text part
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            output.push_str(&openai_sse_chunk(
                                &chunk_id, model,
                                json!({"content": text}),
                                None,
                            ));
                        }
                        // Function call part
                        if let Some(fc) = part.get("functionCall") {
                            let name = fc.get("name").and_then(|n| n.as_str()).unwrap_or("");
                            let args = fc.get("args")
                                .map(|v| serde_json::to_string(v).unwrap_or_default())
                                .unwrap_or_default();
                            output.push_str(&openai_sse_chunk(
                                &chunk_id, model,
                                json!({"tool_calls": [{
                                    "index": 0,
                                    "id": format!("call_{}", uuid::Uuid::new_v4().simple()),
                                    "type": "function",
                                    "function": {"name": name, "arguments": args}
                                }]}),
                                None,
                            ));
                        }
                    }
                }

                // Check finish reason
                let finish = match candidate.get("finishReason").and_then(|f| f.as_str()) {
                    Some("STOP") => Some("stop"),
                    Some("MAX_TOKENS") => Some("length"),
                    Some("SAFETY") => Some("content_filter"),
                    _ => None,
                };
                if let Some(fr) = finish {
                    output.push_str(&openai_sse_chunk(
                        &chunk_id, model,
                        json!({}),
                        Some(fr),
                    ));
                }
            }
        }
    }

    // Ensure [DONE] marker
    if !output.ends_with("data: [DONE]\n\n") {
        output.push_str("data: [DONE]\n\n");
    }

    output.into_bytes()
}

// ═══════════════════════════════════════════════════════════════
// Error Response Normalization (Provider → OpenAI format)
// ═══════════════════════════════════════════════════════════════

/// Normalize a provider-specific error body into OpenAI error format.
///
/// OpenAI error format:
/// ```json
/// {"error":{"message":"...","type":"...","param":null,"code":null}}
/// ```
///
/// Returns `None` if:
/// - The provider is OpenAI/Unknown (no translation needed)
/// - The body is not parseable JSON
/// - The body doesn't look like an error
///
/// Callers should fall through to returning the original body on `None`.
pub fn normalize_error_response(provider: Provider, body: &[u8]) -> Option<serde_json::Value> {
    match provider {
        // Azure OpenAI, Groq, Mistral, Cohere, Ollama all return OpenAI-compatible errors — no normalization needed
        Provider::OpenAI
        | Provider::AzureOpenAI
        | Provider::Groq
        | Provider::Mistral
        | Provider::Cohere
        | Provider::Ollama
        | Provider::Unknown => None,
        Provider::Anthropic => {
            // Anthropic error format:
            // {"type":"error","error":{"type":"invalid_request_error","message":"..."}}
            let json: serde_json::Value = serde_json::from_slice(body).ok()?;
            let err = json.get("error")?;
            let message = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
            let err_type = err.get("type").and_then(|t| t.as_str()).unwrap_or("api_error");
            tracing::debug!(
                provider = "anthropic",
                err_type,
                message,
                "normalizing Anthropic error to OpenAI format"
            );
            Some(json!({
                "error": {
                    "message": message,
                    "type": err_type,
                    "param": null,
                    "code": null
                }
            }))
        }
        Provider::Gemini => {
            // Gemini error format (wrapped in array):
            // [{"error":{"code":400,"message":"...","status":"INVALID_ARGUMENT"}}]
            // OR: {"error":{"code":400,"message":"...","status":"..."}}
            let json: serde_json::Value = serde_json::from_slice(body).ok()?;
            let err_obj = if json.is_array() {
                json.as_array()?.first()?.get("error")?
            } else {
                json.get("error")?
            };
            let message = err_obj.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
            let status = err_obj.get("status").and_then(|s| s.as_str()).unwrap_or("api_error");
            tracing::debug!(
                provider = "gemini",
                status,
                message,
                "normalizing Gemini error to OpenAI format"
            );
            Some(json!({
                "error": {
                    "message": message,
                    "type": status.to_lowercase(),
                    "param": null,
                    "code": err_obj.get("code").cloned()
                }
            }))
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────


#[cfg(test)]
mod tests {
    use super::*;

    // ── Provider Detection ──────────────────────────────────────

    #[test]
    fn test_detect_openai_models() {
        assert_eq!(detect_provider("gpt-4", ""), Provider::OpenAI);
        assert_eq!(detect_provider("gpt-4o-mini", ""), Provider::OpenAI);
        assert_eq!(detect_provider("o1-preview", ""), Provider::OpenAI);
        assert_eq!(detect_provider("o3-mini", ""), Provider::OpenAI);
    }

    #[test]
    fn test_detect_anthropic_models() {
        assert_eq!(detect_provider("claude-3-opus", ""), Provider::Anthropic);
        assert_eq!(detect_provider("claude-3.5-sonnet", ""), Provider::Anthropic);
        assert_eq!(detect_provider("claude-instant-1.2", ""), Provider::Anthropic);
    }

    #[test]
    fn test_detect_gemini_models() {
        assert_eq!(detect_provider("gemini-2.0-flash", ""), Provider::Gemini);
        assert_eq!(detect_provider("gemini-pro", ""), Provider::Gemini);
    }

    #[test]
    fn test_detect_from_url_fallback() {
        assert_eq!(detect_provider("custom-model", "https://api.anthropic.com"), Provider::Anthropic);
        assert_eq!(detect_provider("custom-model", "https://generativelanguage.googleapis.com"), Provider::Gemini);
        assert_eq!(detect_provider("custom-model", "https://api.openai.com"), Provider::OpenAI);
    }

    #[test]
    fn test_detect_unknown() {
        assert_eq!(detect_provider("llama-3", "https://custom.local"), Provider::Unknown);
    }

    // ── OpenAI → Anthropic Translation ──────────────────────────

    #[test]
    fn test_openai_to_anthropic_basic() {
        let body = json!({
            "model": "claude-3-opus-20240229",
            "messages": [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Hello!"}
            ],
            "temperature": 0.7,
            "max_tokens": 1024
        });

        let translated = openai_to_anthropic_request(&body);

        assert_eq!(translated["model"], "claude-3-opus-20240229");
        assert_eq!(translated["max_tokens"], 1024);
        assert_eq!(translated["system"], "You are helpful.");
        assert_eq!(translated["temperature"], 0.7);

        let messages = translated["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1); // system extracted
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[0]["content"], "Hello!");
    }

    #[test]
    fn test_openai_to_anthropic_with_tools() {
        let body = json!({
            "model": "claude-3-opus-20240229",
            "messages": [{"role": "user", "content": "What's the weather?"}],
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get the weather",
                    "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}
                }
            }]
        });

        let translated = openai_to_anthropic_request(&body);
        let tools = translated["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "get_weather");
        assert!(tools[0].get("input_schema").is_some());
    }

    #[test]
    fn test_anthropic_to_openai_response() {
        let body = json!({
            "id": "msg_01abc",
            "type": "message",
            "content": [{"type": "text", "text": "Hello!"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 10, "output_tokens": 5}
        });

        let translated = anthropic_to_openai_response(&body, "claude-3-opus");
        assert_eq!(translated["id"], "msg_01abc");
        assert_eq!(translated["object"], "chat.completion");
        assert_eq!(translated["choices"][0]["message"]["content"], "Hello!");
        assert_eq!(translated["choices"][0]["finish_reason"], "stop");
        assert_eq!(translated["usage"]["prompt_tokens"], 10);
        assert_eq!(translated["usage"]["completion_tokens"], 5);
        assert_eq!(translated["usage"]["total_tokens"], 15);
    }

    #[test]
    fn test_anthropic_tool_use_response() {
        let body = json!({
            "id": "msg_01abc",
            "content": [
                {"type": "text", "text": "Let me check."},
                {"type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": {"city": "NYC"}}
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 10, "output_tokens": 20}
        });

        let translated = anthropic_to_openai_response(&body, "claude-3-opus");
        assert_eq!(translated["choices"][0]["finish_reason"], "tool_calls");
        let tool_calls = translated["choices"][0]["message"]["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["function"]["name"], "get_weather");
    }

    // ── OpenAI → Gemini Translation ─────────────────────────────

    #[test]
    fn test_openai_to_gemini_basic() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Hello!"},
                {"role": "assistant", "content": "Hi!"},
                {"role": "user", "content": "How are you?"}
            ],
            "temperature": 0.5,
            "max_tokens": 512
        });

        let translated = openai_to_gemini_request(&body);

        // System instruction should be extracted
        assert!(translated.get("systemInstruction").is_some());
        assert_eq!(translated["systemInstruction"]["parts"][0]["text"], "You are helpful.");

        // Contents should have user/model roles
        let contents = translated["contents"].as_array().unwrap();
        assert_eq!(contents.len(), 3); // system excluded
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[1]["role"], "model"); // assistant → model

        // Generation config
        assert_eq!(translated["generationConfig"]["temperature"], 0.5);
        assert_eq!(translated["generationConfig"]["maxOutputTokens"], 512);
    }

    #[test]
    fn test_gemini_to_openai_response() {
        let body = json!({
            "candidates": [{
                "content": {
                    "parts": [{"text": "Hello!"}],
                    "role": "model"
                },
                "finishReason": "STOP"
            }],
            "usageMetadata": {
                "promptTokenCount": 8,
                "candidatesTokenCount": 3,
                "totalTokenCount": 11
            }
        });

        let translated = gemini_to_openai_response(&body, "gemini-2.0-flash");
        assert_eq!(translated["object"], "chat.completion");
        assert_eq!(translated["choices"][0]["message"]["content"], "Hello!");
        assert_eq!(translated["choices"][0]["finish_reason"], "stop");
        assert_eq!(translated["usage"]["prompt_tokens"], 8);
        assert_eq!(translated["usage"]["completion_tokens"], 3);
    }

    #[test]
    fn test_gemini_tool_call_response() {
        let body = json!({
            "candidates": [{
                "content": {
                    "parts": [
                        {"functionCall": {"name": "get_weather", "args": {"city": "NYC"}}}
                    ],
                    "role": "model"
                },
                "finishReason": "STOP"
            }],
            "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5}
        });

        let translated = gemini_to_openai_response(&body, "gemini-2.0-flash");
        let tool_calls = translated["choices"][0]["message"]["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["function"]["name"], "get_weather");
    }

    // ── URL Rewriting ───────────────────────────────────────────

    #[test]
    fn test_rewrite_gemini_url_non_streaming() {
        let url = rewrite_upstream_url(
            Provider::Gemini,
            "https://generativelanguage.googleapis.com",
            "gemini-2.0-flash",
            false,
        );
        assert_eq!(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    }

    #[test]
    fn test_rewrite_gemini_url_streaming() {
        let url = rewrite_upstream_url(
            Provider::Gemini,
            "https://generativelanguage.googleapis.com",
            "gemini-2.0-flash",
            true,
        );
        assert_eq!(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent");
    }

    #[test]
    fn test_rewrite_anthropic_url() {
        let url = rewrite_upstream_url(
            Provider::Anthropic,
            "https://api.anthropic.com",
            "claude-3-opus",
            false,
        );
        assert_eq!(url, "https://api.anthropic.com/v1/messages");
    }

    #[test]
    fn test_rewrite_openai_url_passthrough() {
        let url = rewrite_upstream_url(
            Provider::OpenAI,
            "https://api.openai.com/v1/chat/completions",
            "gpt-4",
            false,
        );
        assert_eq!(url, "https://api.openai.com/v1/chat/completions");
    }

    // ── Multimodal Content (Gemini) ─────────────────────────────

    #[test]
    fn test_gemini_multimodal_base64_image() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is this?"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0K"}}
                ]
            }]
        });
        let translated = openai_to_gemini_request(&body);
        let parts = &translated["contents"][0]["parts"];
        assert!(parts.as_array().unwrap().len() == 2);
        // First part: text
        assert_eq!(parts[0]["text"], "What is this?");
        // Second part: inlineData (base64)
        assert!(parts[1].get("inlineData").is_some());
        assert_eq!(parts[1]["inlineData"]["mimeType"], "image/png");
        assert_eq!(parts[1]["inlineData"]["data"], "iVBORw0K");
    }

    #[test]
    fn test_gemini_multimodal_url_image() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe:"},
                    {"type": "image_url", "image_url": {"url": "https://example.com/photo.png"}}
                ]
            }]
        });
        let translated = openai_to_gemini_request(&body);
        let parts = &translated["contents"][0]["parts"];
        // Second part: fileData (HTTP URL)
        assert!(parts[1].get("fileData").is_some());
        assert_eq!(parts[1]["fileData"]["mimeType"], "image/png");
        assert_eq!(parts[1]["fileData"]["fileUri"], "https://example.com/photo.png");
    }

    // ── response_format (Gemini) ────────────────────────────────

    #[test]
    fn test_gemini_response_format_json_object() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{"role": "user", "content": "Return JSON"}],
            "response_format": {"type": "json_object"}
        });
        let translated = openai_to_gemini_request(&body);
        assert_eq!(translated["generationConfig"]["responseMimeType"], "application/json");
    }

    #[test]
    fn test_gemini_response_format_json_schema() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{"role": "user", "content": "Return structured JSON"}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "my_schema",
                    "schema": {"type": "object", "properties": {"name": {"type": "string"}}}
                }
            }
        });
        let translated = openai_to_gemini_request(&body);
        assert_eq!(translated["generationConfig"]["responseMimeType"], "application/json");
        assert!(translated["generationConfig"].get("responseSchema").is_some());
    }

    // ── tool_choice (Anthropic) ─────────────────────────────────

    #[test]
    fn test_anthropic_tool_choice_auto() {
        let body = json!({
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": "hi"}],
            "tools": [{"type": "function", "function": {"name": "foo", "description": "", "parameters": {}}}],
            "tool_choice": "auto"
        });
        let translated = openai_to_anthropic_request(&body);
        assert_eq!(translated["tool_choice"]["type"], "auto");
    }

    #[test]
    fn test_anthropic_tool_choice_required() {
        let body = json!({
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": "hi"}],
            "tools": [{"type": "function", "function": {"name": "foo", "description": "", "parameters": {}}}],
            "tool_choice": "required"
        });
        let translated = openai_to_anthropic_request(&body);
        assert_eq!(translated["tool_choice"]["type"], "any");
    }

    #[test]
    fn test_anthropic_tool_choice_specific_function() {
        let body = json!({
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": "hi"}],
            "tools": [{"type": "function", "function": {"name": "get_weather", "description": "", "parameters": {}}}],
            "tool_choice": {"type": "function", "function": {"name": "get_weather"}}
        });
        let translated = openai_to_anthropic_request(&body);
        assert_eq!(translated["tool_choice"]["type"], "tool");
        assert_eq!(translated["tool_choice"]["name"], "get_weather");
    }

    // ── tool_choice (Gemini) ────────────────────────────────────

    #[test]
    fn test_gemini_tool_choice_auto() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{"role": "user", "content": "hi"}],
            "tool_choice": "auto"
        });
        let translated = openai_to_gemini_request(&body);
        assert_eq!(translated["toolConfig"]["functionCallingConfig"]["mode"], "AUTO");
    }

    #[test]
    fn test_gemini_tool_choice_none() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{"role": "user", "content": "hi"}],
            "tool_choice": "none"
        });
        let translated = openai_to_gemini_request(&body);
        assert_eq!(translated["toolConfig"]["functionCallingConfig"]["mode"], "NONE");
    }

    #[test]
    fn test_gemini_tool_choice_specific_function() {
        let body = json!({
            "model": "gemini-2.0-flash",
            "messages": [{"role": "user", "content": "hi"}],
            "tool_choice": {"type": "function", "function": {"name": "get_weather"}}
        });
        let translated = openai_to_gemini_request(&body);
        let fc = &translated["toolConfig"]["functionCallingConfig"];
        assert_eq!(fc["mode"], "ANY");
        assert!(fc["allowedFunctionNames"][0] == "get_weather");
    }

    // ── Provider Header Injection ───────────────────────────────

    #[test]
    fn test_inject_anthropic_version_header() {
        let mut headers = reqwest::header::HeaderMap::new();
        inject_provider_headers(Provider::Anthropic, &mut headers, false);
        assert_eq!(
            headers.get("anthropic-version").and_then(|v| v.to_str().ok()),
            Some("2023-06-01")
        );
    }

    #[test]
    fn test_inject_anthropic_streaming_accept_header() {
        let mut headers = reqwest::header::HeaderMap::new();
        inject_provider_headers(Provider::Anthropic, &mut headers, true);
        assert_eq!(
            headers.get("anthropic-version").and_then(|v| v.to_str().ok()),
            Some("2023-06-01")
        );
        assert!(headers.contains_key(reqwest::header::ACCEPT));
    }

    #[test]
    fn test_inject_openai_no_extra_headers() {
        let mut headers = reqwest::header::HeaderMap::new();
        inject_provider_headers(Provider::OpenAI, &mut headers, false);
        assert!(headers.is_empty(), "OpenAI should not inject extra headers");
    }

    #[test]
    fn test_policy_header_wins_over_injection() {
        // If anthropic-version is already set (e.g. by policy), it should not be overwritten
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("anthropic-version", "2025-01-01".parse().unwrap());
        inject_provider_headers(Provider::Anthropic, &mut headers, false);
        assert_eq!(
            headers.get("anthropic-version").and_then(|v| v.to_str().ok()),
            Some("2025-01-01") // original value preserved
        );
    }

    // ── translate_request dispatch ──────────────────────────────

    #[test]
    fn test_translate_request_openai_passthrough() {
        let body = json!({"model": "gpt-4", "messages": []});
        assert!(translate_request(Provider::OpenAI, &body).is_none());
    }

    #[test]
    fn test_translate_request_anthropic() {
        let body = json!({"model": "claude-3-opus", "messages": [{"role": "user", "content": "hi"}]});
        assert!(translate_request(Provider::Anthropic, &body).is_some());
    }

    #[test]
    fn test_translate_request_gemini() {
        let body = json!({"model": "gemini-pro", "messages": [{"role": "user", "content": "hi"}]});
        assert!(translate_request(Provider::Gemini, &body).is_some());
    }

    // ── SSE Translation Tests ───────────────────────────────────

    #[test]
    fn test_translate_sse_openai_passthrough() {
        let body = b"data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n";
        assert!(translate_sse_body(Provider::OpenAI, body, "gpt-4").is_none());
        assert!(translate_sse_body(Provider::Unknown, body, "custom").is_none());
    }

    #[test]
    fn test_anthropic_sse_text_streaming() {
        let body = b"\
event: message_start\n\
data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_01\",\"model\":\"claude-3-opus\",\"usage\":{\"input_tokens\":10}}}\n\
\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\
\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" world\"}}\n\
\n\
event: message_delta\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\
\n\
event: message_stop\n\
data: {\"type\":\"message_stop\"}\n\
\n";

        let result = translate_sse_body(Provider::Anthropic, body, "claude-3-opus");
        assert!(result.is_some());
        let output = String::from_utf8(result.unwrap()).unwrap();

        // Should contain OpenAI-format chunks
        assert!(output.contains("chat.completion.chunk"));
        // Role chunk
        assert!(output.contains("\"role\":\"assistant\""));
        // Text deltas
        assert!(output.contains("\"content\":\"Hello\""));
        assert!(output.contains("\"content\":\" world\""));
        // Finish reason
        assert!(output.contains("\"finish_reason\":\"stop\""));
        // Done marker
        assert!(output.contains("data: [DONE]"));
    }

    #[test]
    fn test_anthropic_sse_tool_streaming() {
        let body = b"\
event: message_start\n\
data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_02\",\"model\":\"claude-3-opus\"}}\n\
\n\
event: content_block_start\n\
data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_01\",\"name\":\"get_weather\"}}\n\
\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"city\\\"\"}}\n\
\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\": \\\"NYC\\\"}\"}}\n\
\n\
event: message_delta\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"}}\n\
\n\
event: message_stop\n\
data: {\"type\":\"message_stop\"}\n\
\n";

        let result = translate_sse_body(Provider::Anthropic, body, "claude-3-opus");
        let output = String::from_utf8(result.unwrap()).unwrap();

        // Should emit tool call header
        assert!(output.contains("\"name\":\"get_weather\""));
        assert!(output.contains("\"id\":\"toolu_01\""));
        // Tool call argument deltas
        assert!(output.contains("\"arguments\":\"{\\\"city\\\"\""));
        // Finish reason for tool use
        assert!(output.contains("\"finish_reason\":\"tool_calls\""));
    }

    #[test]
    fn test_gemini_sse_text_streaming() {
        let body = b"\
data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}],\"role\":\"model\"}}]}\n\
\n\
data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" there!\"}],\"role\":\"model\"},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":5,\"candidatesTokenCount\":3}}\n\
\n";

        let result = translate_sse_body(Provider::Gemini, body, "gemini-2.0-flash");
        let output = String::from_utf8(result.unwrap()).unwrap();

        assert!(output.contains("chat.completion.chunk"));
        assert!(output.contains("\"role\":\"assistant\""));
        assert!(output.contains("\"content\":\"Hello\""));
        assert!(output.contains("\"content\":\" there!\""));
        assert!(output.contains("\"finish_reason\":\"stop\""));
        assert!(output.contains("data: [DONE]"));
    }

    #[test]
    fn test_gemini_sse_function_call() {
        let body = b"\
data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"get_weather\",\"args\":{\"city\":\"NYC\"}}}],\"role\":\"model\"},\"finishReason\":\"STOP\"}]}\n\
\n";

        let result = translate_sse_body(Provider::Gemini, body, "gemini-2.0-flash");
        let output = String::from_utf8(result.unwrap()).unwrap();

        assert!(output.contains("\"name\":\"get_weather\""));
        assert!(output.contains("\"arguments\""));
        assert!(output.contains("data: [DONE]"));
    }

    #[test]
    fn test_anthropic_sse_empty_body() {
        let body = b"";
        let result = translate_sse_body(Provider::Anthropic, body, "claude-3-opus");
        assert!(result.is_some());
        let output = String::from_utf8(result.unwrap()).unwrap();
        // Should be empty (no events to translate)
        assert!(output.is_empty() || output.trim().is_empty());
    }
}
