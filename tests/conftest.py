import pytest
import httpx
import os
import uuid
import time

# Configuration
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY = os.getenv("AILink_ADMIN_KEY", "ailink-admin-test")

@pytest.fixture(scope="session")
def gateway_url():
    return GATEWAY_URL

@pytest.fixture(scope="session")
def admin_key():
    return ADMIN_KEY

@pytest.fixture(scope="session")
def admin_client(gateway_url, admin_key):
    """Client for Admin API operations (Projects, Policies, Tokens)"""
    headers = {
        "X-Admin-Key": admin_key,
        "Content-Type": "application/json"
    }
    with httpx.Client(base_url=f"{gateway_url}/api/v1", headers=headers, timeout=10.0) as client:
        yield client

@pytest.fixture(scope="function")
def new_project(admin_client):
    """Creates a temporary project and returns its ID. Cleaning up is hard on PG without delete, so we just return ID."""
    name = f"test-proj-{uuid.uuid4().hex[:8]}"
    resp = admin_client.post("/projects", json={"name": name})
    assert resp.status_code == 201, f"Failed to create project: {resp.text}"
    project = resp.json()
    return project

@pytest.fixture(scope="function")
def new_credential(admin_client, new_project):
    """Creates a dummy credential in the temp project"""
    project_id = new_project["id"]
    # We must patch the client to use this project context if header-based, 
    # but currently admin API takes project_id in body OR header? 
    # Let's assume header for admin ops targeting a project.
    
    # Actually, create_credential might need project_id in body or header. 
    # Let's check api.ts or docs. Usually header X-Project-Id.
    
    # For robust tests, we'll try sending X-Project-Id header in a specific request
    headers = admin_client.headers.copy()
    headers["X-Project-Id"] = project_id
    
    cred_name = f"cred-{uuid.uuid4().hex[:8]}"
    payload = {
        "name": cred_name,
        "provider": "openai",
        "secret": "sk-dummy-test-key",
        "project_id": project_id
    }
    resp = admin_client.post("/credentials", json=payload, headers=headers)
    assert resp.status_code == 201, f"Failed to create credential: {resp.text}"
    return resp.json(), project_id

