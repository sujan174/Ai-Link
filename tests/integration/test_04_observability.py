import pytest
import httpx
import psycopg2
import uuid
import time
import json
from datetime import datetime

# Connect to localhost:5432 (exposed by Docker)
# User/Pass from docker-compose.yml
# Connect to localhost:5432 (exposed by Docker)
# User/Pass from docker-compose.yml
DB_DSN = "postgresql://postgres:password@localhost:5432/ailink"

def get_audit_logs(project_id, limit=10):
    import os
    print(f"DEBUG: Using DB_DSN={DB_DSN}")
    print(f"DEBUG: PG Env Vars: {[k for k in os.environ if k.startswith('PG')]}")
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    cur.execute(
        "SELECT id, path, policy_result, agent_name, created_at, response_latency_ms, fields_redacted, shadow_violations FROM audit_logs WHERE project_id = %s ORDER BY created_at DESC LIMIT %s",
        (str(project_id), limit)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

def test_shadow_mode_logging(gateway_url, admin_client, new_credential):
    cred, project_id = new_credential

    # 1. Create Shadow Policy (Rate Limit: 1/min)
    policy_resp = admin_client.post("/policies", json={
        "name": f"shadow-rl-{uuid.uuid4().hex[:6]}",
        "mode": "shadow",
        "rules": [
            { "type": "rate_limit", "window": "minute", "max_requests": 1 }
        ]
    }, headers={"X-Project-Id": project_id})
    policy_id = policy_resp.json()["id"]

    # 2. Create Token
    token_resp = admin_client.post("/tokens", json={
        "name": "shadow-test-token",
        "credential_id": cred["id"],
        "policy_ids": [policy_id],
        "upstream_url": "http://mock-upstream:80",
        "project_id": project_id
    })
    token = token_resp.json()["token_id"]

    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Trigger Rate Limit (2 requests)
    # Request 1: OK
    resp1 = httpx.post(f"{gateway_url}/post", json={"msg":"1"}, headers=headers)
    assert resp1.status_code == 200
    
    # Request 2: Should be OK (Shadow Mode!) but logged as violation
    resp2 = httpx.post(f"{gateway_url}/post", json={"msg":"2"}, headers=headers)
    assert resp2.status_code == 200, "Shadow mode should NOT block request"

    # 4. Verify Audit Log
    time.sleep(1) # Allow async logging
    logs = get_audit_logs(project_id)
    
    # Check for shadow violation in the latest log
    latest_log = logs[0]
    # fields: 0=id, 1=path, 2=result, 3=agent, 4=ts, 5=lat, 6=redacted, 7=shadow
    shadow_violations = latest_log[7]
    
    assert shadow_violations is not None, "Shadow violations field is None"
    assert len(shadow_violations) > 0, "No shadow violations recorded"
    assert "rate limit exceeded" in shadow_violations[0], f"Expected rate limit violation, got {shadow_violations}"

def test_pii_redaction(gateway_url, admin_client, new_credential):
    cred, project_id = new_credential
    
    # Create Token (no policy needed)
    token_resp = admin_client.post("/tokens", json={
        "name": "pii-test-token",
        "credential_id": cred["id"],
        "upstream_url": "http://mock-upstream:80",
        "project_id": project_id
    })
    token = token_resp.json()["token_id"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Send Request with PII in Generation (Mock Upstream needs to echo it)
    # httpbin/post echoes data.
    # We send PII in REQUEST body. Audit log captures executed request/response?
    # Gateway logs response body? 
    # Current implementation logs execution metadata.
    # Does it log request/response bodies? 
    # `AuditEntry` struct has `fields_redacted`.
    # `log_audit_entry` calculates it.
    # `sanitize_response` is called on RESPONSE body.
    # So we need UPSTREAM to return PII.
    
    # We send PII to mock-upstream/post, which echoes it back.
    pii_payload = {
        "email": "user@example.com",
        "api_key": "sk-1234567890abcdef1234567890abcdef"
    }
    
    resp = httpx.post(f"{gateway_url}/post", json=pii_payload, headers=headers)
    assert resp.status_code == 200
    
    # 2. Response from Gateway should be REDACTED?
    # Gateway `proxy/handler.rs` calls `sanitize_response` on the executed response BEFORE returning to client?
    # Let's check `handler.rs`.
    # Yes, `let (sanitized_body, redacted) = sanitize::sanitize_response(...)`.
    # And it returns `sanitized_body`.
    
    body_str = resp.text
    assert "user@example.com" not in body_str, "Email leaked in response"
    assert "[REDACTED_EMAIL]" in body_str, "Email not redacted"
    
    # 3. Verify Audit Log records what was redacted
    time.sleep(1)
    logs = get_audit_logs(project_id)
    latest_log = logs[0]
    redacted_fields = latest_log[6] # 6=fields_redacted
    
    assert redacted_fields is not None
    assert "email" in redacted_fields
    assert "api_key" in redacted_fields
