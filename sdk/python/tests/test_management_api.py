"""
End-to-end tests for new Management API endpoints:
  - Policies CRUD: POST, GET, PUT, DELETE /api/v1/policies
  - Credentials: GET, POST /api/v1/credentials
  - Token Revocation: DELETE /api/v1/tokens/:id
"""

import os
import sys
import httpx
import time

GATEWAY = os.getenv("GATEWAY_URL", "http://localhost:8443")
ADMIN_KEY = os.getenv("AILINK_ADMIN_KEY", os.getenv("AILINK_MASTER_KEY", ""))

# Try to read from docker-compose default
if not ADMIN_KEY:
    ADMIN_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

BASE = f"{GATEWAY}/api/v1"

client = httpx.Client(
    base_url=BASE,
    headers={
        "X-Admin-Key": ADMIN_KEY,
        "Content-Type": "application/json",
    },
    timeout=10,
)


# ── Policies CRUD ─────────────────────────────────


# ── Policies CRUD ─────────────────────────────────

def step_01_list_policies_empty():
    """GET /policies — should return a list."""
    resp = client.get("/policies")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    print(f"  ✓ list_policies: {len(data)} existing policies")


def step_02_create_policy():
    """POST /policies — create a policy with HumanApproval rule."""
    resp = client.post("/policies", json={
        "name": f"test-policy-{int(time.time())}",
        "mode": "enforce",
        "rules": [{"type": "human_approval"}],
    })
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "id" in data
    assert data["message"] == "Policy created"
    print(f"  ✓ create_policy: id={data['id']}")
    return data["id"]


def step_03_update_policy(policy_id: str):
    """PUT /policies/:id — update mode to shadow."""
    resp = client.put(f"/policies/{policy_id}", json={
        "mode": "shadow",
    })
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["message"] == "Policy updated"
    print(f"  ✓ update_policy: {policy_id} → shadow mode")


def step_04_delete_policy(policy_id: str):
    """DELETE /policies/:id — soft-delete."""
    resp = client.delete(f"/policies/{policy_id}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["deleted"] is True
    print(f"  ✓ delete_policy: {policy_id} deactivated")


def step_05_create_policy_bad_mode():
    """POST /policies — invalid mode should return 400."""
    resp = client.post("/policies", json={
        "name": "bad-policy",
        "mode": "yolo",
        "rules": [],
    })
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    print("  ✓ create_policy bad mode → 400")


# ── Credentials ───────────────────────────────────

def step_06_list_credentials():
    """GET /credentials — should return a list."""
    resp = client.get("/credentials")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    print(f"  ✓ list_credentials: {len(data)} existing credentials")


def step_07_create_credential():
    """POST /credentials — create encrypted credential."""
    resp = client.post("/credentials", json={
        "name": f"test-cred-{int(time.time())}",
        "provider": "openai",
        "secret": "sk-test-fake-key-for-testing",
    })
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "id" in data
    assert data["message"] == "Credential encrypted and stored"
    print(f"  ✓ create_credential: id={data['id']}")
    return data["id"]


# ── Token Revocation ──────────────────────────────

def step_08_token_revocation(credential_id: str):
    """DELETE /tokens/:id — revoke a token."""
    # First create a token to revoke
    create_resp = client.post("/tokens", json={
        "name": f"revoke-test-{int(time.time())}",
        "credential_id": credential_id,
        "upstream_url": "https://api.openai.com",
    })
    assert create_resp.status_code == 201, f"Token creation failed: {create_resp.text}"
    token_id = create_resp.json()["token_id"]

    # Revoke it
    resp = client.delete(f"/tokens/{token_id}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["revoked"] is True
    print(f"  ✓ revoke_token: {token_id[:30]}... revoked")


def step_09_revoke_nonexistent_token():
    """DELETE /tokens/:id — revoking a non-existent token returns revoked=false."""
    resp = client.delete("/tokens/nonexistent_token_id")
    assert resp.status_code == 200
    data = resp.json()
    assert data["revoked"] is False
    print("  ✓ revoke nonexistent token → revoked=false")


# ── SDK integration ───────────────────────────────

def step_10_sdk_policies():
    """Test policies via SDK client."""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from ailink.client import Client

        admin = Client.admin(
            admin_key=ADMIN_KEY,
            gateway_url=GATEWAY,
        )

        # List
        policies = admin.policies.list()
        assert isinstance(policies, list)

        # Create
        result = admin.policies.create(
            name=f"sdk-policy-{int(time.time())}",
            rules=[{"type": "method_whitelist", "methods": ["POST"]}],
            mode="enforce",
        )
        assert "id" in result

        # Delete
        delete_result = admin.policies.delete(result["id"])
        assert delete_result["deleted"] is True

        print("  ✓ SDK policies: list, create, delete all work")
    except ImportError:
        print("  ⚠ SDK not importable, skipping SDK test")


def step_11_sdk_credentials():
    """Test credentials via SDK client."""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from ailink.client import Client

        admin = Client.admin(
            admin_key=ADMIN_KEY,
            gateway_url=GATEWAY,
        )

        # List
        creds = admin.credentials.list()
        assert isinstance(creds, list)

        # Create
        result = admin.credentials.create(
            name=f"sdk-cred-{int(time.time())}",
            provider="anthropic",
            secret="sk-ant-test-fake",
        )
        assert "id" in result

        print("  ✓ SDK credentials: list, create work")
    except ImportError:
        print("  ⚠ SDK not importable, skipping SDK test")


def step_12_sdk_token_revoke():
    """Test token revocation via SDK."""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from ailink.client import Client

        admin = Client.admin(
            admin_key=ADMIN_KEY,
            gateway_url=GATEWAY,
        )

        # Create a credential first
        cred = admin.credentials.create(
            name=f"revoke-sdk-cred-{int(time.time())}",
            provider="openai",
            secret="sk-test-fake",
        )

        # Create a token
        token = admin.tokens.create(
            name=f"revoke-sdk-test-{int(time.time())}",
            credential_id=cred["id"],
            upstream_url="https://api.openai.com",
        )

        # Revoke it
        result = admin.tokens.revoke(token["token_id"])
        assert result["revoked"] is True

        print("  ✓ SDK token revoke works")
    except ImportError:
        print("  ⚠ SDK not importable, skipping SDK test")


def test_management_api_e2e():
    """Run all steps in order."""
    print("\n🧪 Management API Extension Tests\n" + "=" * 42)

    # ── Policies CRUD ──
    print("\n── Policies CRUD ──")
    step_01_list_policies_empty()
    policy_id = step_02_create_policy()
    step_03_update_policy(policy_id)
    step_04_delete_policy(policy_id)
    step_05_create_policy_bad_mode()

    # ── Credentials ──
    print("\n── Credentials ──")
    step_06_list_credentials()
    credential_id = step_07_create_credential()

    # ── Token Revocation ──
    print("\n── Token Revocation ──")
    if credential_id:
        step_08_token_revocation(credential_id)
    else:
        print("  ⚠ Skipped (no credential_id)")
    
    step_09_revoke_nonexistent_token()

    # ── SDK Integration ──
    print("\n── SDK Integration ──")
    step_10_sdk_policies()
    step_11_sdk_credentials()
    step_12_sdk_token_revoke()
    
    print("\n✅ All E2E steps passed!")

