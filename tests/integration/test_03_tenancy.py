import pytest
import httpx
import uuid

def test_project_isolation(gateway_url, admin_client):
    # 1. Create Project Alpha
    alpha_name = f"alpha-{uuid.uuid4().hex[:6]}"
    resp_a = admin_client.post("/projects", json={"name": alpha_name})
    assert resp_a.status_code == 201
    proj_a_id = resp_a.json()["id"]

    # 2. Create Project Beta
    beta_name = f"beta-{uuid.uuid4().hex[:6]}"
    resp_b = admin_client.post("/projects", json={"name": beta_name})
    assert resp_b.status_code == 201
    proj_b_id = resp_b.json()["id"]

    # 3. Create Resource in Alpha (Credential + Token)
    # Credential
    cred_resp = admin_client.post("/credentials", json={
        "name": "alpha-cred",
        "provider": "openai",
        "secret": "sk-alpha",
        "project_id": proj_a_id
    })
    assert cred_resp.status_code == 201
    cred_id = cred_resp.json()["id"]

    # Token
    token_resp = admin_client.post("/tokens", json={
        "name": "alpha-token",
        "credential_id": cred_id,
        "policy_ids": [],
        "upstream_url": "http://mock-upstream:80",
        "project_id": proj_a_id
    })
    assert token_resp.status_code == 201
    token_a_id = token_resp.json()["token_id"]

    # 4. Verify Visibility from Beta
    # List tokens scoped to Beta -> Should be EMPTY
    list_resp = admin_client.get("/tokens", params={"project_id": proj_b_id})
    assert list_resp.status_code == 200
    tokens_b = list_resp.json()
    assert len(tokens_b) == 0, "Beta project should see 0 tokens"

    # List tokens scoped to Alpha -> Should see 1
    list_resp_a = admin_client.get("/tokens", params={"project_id": proj_a_id})
    assert list_resp_a.status_code == 200
    tokens_a = list_resp_a.json()
    assert len(tokens_a) >= 1
    assert any(t["id"] == token_a_id for t in tokens_a)

