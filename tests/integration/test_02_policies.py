import pytest
import httpx
import uuid
import time

def test_spend_cap_enforcement(gateway_url, admin_client, new_credential):
    cred, project_id = new_credential
    
    # 1. Create Spend Cap Policy ($0.01)
    policy_resp = admin_client.post("/policies", json={
        "name": f"spend-cap-{uuid.uuid4().hex[:6]}",
        "mode": "enforce",
        "rules": [
            { "type": "spend_cap", "window": "daily", "max_usd": 0.01 }
        ]
    }, headers={"X-Project-Id": project_id})
    policy_id = policy_resp.json()["id"]

    # 2. Create Token
    token_resp = admin_client.post("/tokens", json={
        "name": "spend-test-token",
        "credential_id": cred["id"],
        "policy_ids": [policy_id],
        "upstream_url": "http://mock-upstream:80",
        "project_id": project_id
    })
    assert token_resp.status_code == 201
    token = token_resp.json()["token_id"]

    headers = {"Authorization": f"Bearer {token}"}
    payload = {"prompt": "test cost accumulation"} 

    # 3. Exhaust Budget
    # Each request costs something. Let's send enough to breach.
    # Limit is 0.01. We send 0.1 per request. Should block immediately after 1st success (or even 1st if pre-check?).
    # Implementation checks usage AFTER request for "track_spend", but "check_spend_cap" is BEFORE.
    # So 1st request succeeds (usage 0->0.1). 2nd request sees 0.1 > 0.01 -> Block.
    blocked = False
    headers["X-AILink-Test-Cost"] = "0.1" 
    
    # We expect 402 on the second call
    for i in range(5):
        resp = httpx.post(f"{gateway_url}/post", json=payload, headers=headers)
        if resp.status_code == 402:
            blocked = True
            break
        time.sleep(0.1)
    
    assert blocked, "Spend cap was not enforced (expected 402)"

def test_hitl_approval(gateway_url, admin_client, new_credential):
    cred, project_id = new_credential

    # 1. Create HITL access policy
    policy_resp = admin_client.post("/policies", json={
        "name": f"hitl-{uuid.uuid4().hex[:6]}",
        "mode": "enforce",
        "rules": [
            { "type": "human_approval", "timeout": "10m", "fallback": "deny" }
        ]
    }, headers={"X-Project-Id": project_id})
    policy_id = policy_resp.json()["id"]

    # 2. Create Token
    token_resp = admin_client.post("/tokens", json={
        "name": "hitl-test-token",
        "credential_id": cred["id"],
        "policy_ids": [policy_id],
        "upstream_url": "http://mock-upstream:80",
        "project_id": project_id
    })
    token = token_resp.json()["token_id"]

    # 3. Send Request in a separate thread (it will block)
    import concurrent.futures
    import time
    
    def send_blocked_request():
        h = {"Authorization": f"Bearer {token}"}
        # Increased timeout to 60s to avoid flakiness vs Gateway 30s poll
        return httpx.post(f"{gateway_url}/post", json={"msg":"hi"}, headers=h, timeout=60.0)

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(send_blocked_request)
        
        # Wait for request to reach Gateway and create approval
        time.sleep(2)
        
        # 4. Check for pending approval via Admin API
        # We need to list approvals for the project
        # The list endpoint might default to pending
        list_resp = admin_client.get(f"/approvals", params={"project_id": project_id})
        assert list_resp.status_code == 200
        approvals = list_resp.json()
        assert len(approvals) > 0, "No pending approvals found"
        approval_id = approvals[0]["id"]
        
        # 5. Approve it
        decision_resp = admin_client.post(f"/approvals/{approval_id}/decision", json={"decision": "approved"}, params={"project_id": project_id})
        assert decision_resp.status_code == 200
        
        # 6. Check thread result
        # The gateway should now unblock and return 200 (from upstream)
        resp = future.result()
        assert resp.status_code == 200
