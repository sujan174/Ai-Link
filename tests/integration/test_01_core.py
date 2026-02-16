import pytest
import httpx
import uuid

def test_health(gateway_url):
    resp = httpx.get(f"{gateway_url}/healthz")
    assert resp.status_code == 200
    assert resp.text == "ok"

def test_ready(gateway_url):
    resp = httpx.get(f"{gateway_url}/readyz")
    assert resp.status_code == 200
    assert resp.text == "ok"

# ... (skip auth_no_token / invalid_token)

def test_auth_valid_token(gateway_url, admin_client, new_credential):
    # 1. Create Token
    cred, project_id = new_credential
    project_id_str = project_id
    
    # Create a permissive policy
    policy_resp = admin_client.post("/policies", json={
        "name": f"permissive-{uuid.uuid4().hex[:6]}",
        "mode": "enforce",
        "rules": []
    }, headers={"X-Project-Id": project_id_str})
    assert policy_resp.status_code == 201
    policy_id = policy_resp.json()["id"]

    # Create Token
    token_resp = admin_client.post("/tokens", json={
        "name": "test-valid-token",
        "credential_id": cred["id"],
        "policy_ids": [policy_id],
        "upstream_url": "http://mock-upstream:80", 
        "project_id": project_id_str
    })
    assert token_resp.status_code == 201
    token = token_resp.json()["token_id"]

    # 2. Use Token
    headers = {"Authorization": f"Bearer {token}"}
    # Mock upstream echoes the body
    payload = {"message": "hello"}
    # Target /post so Gateway forwards to http://mock-upstream:80/post coverage
    resp = httpx.post(f"{gateway_url}/post", json=payload, headers=headers)
    
    assert resp.status_code == 200
    # Mock upstream httpbin/post returns data in 'json' field
    assert resp.json()["json"] == payload
