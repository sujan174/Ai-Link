
import httpx
import time
import random
import uuid
from datetime import datetime

GATEWAY_URL = "http://localhost:8443"
ADMIN_KEY = "ailink-admin-test"
DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001"

def seed():
    print(f"🌱 Seeding demo data for Project: {DEFAULT_PROJECT_ID}")
    
    with httpx.Client(base_url=GATEWAY_URL + "/api/v1", timeout=10.0) as client:
        # 1. Create Credential
        print("Creating credential...")
        resp = client.post("/credentials", json={
            "name": "demo-openai-key",
            "provider": "openai",
            "secret": "sk-mock-key-12345",
            "project_id": DEFAULT_PROJECT_ID
        }, headers={"X-Admin-Key": ADMIN_KEY})
        if resp.status_code != 201:
            print(f"Failed to create credential: {resp.status_code} {resp.text}")
            return
        cred_id = resp.json()["id"]

        # 2. Create Rate Limit Policy
        print("Creating policies...")
        resp = client.post("/policies", json={
            "name": "rate-limit-100",
            "mode": "enforce",
            "rules": [
                {"type": "rate_limit", "window": "1m", "max_requests": 100}
            ],
            "project_id": DEFAULT_PROJECT_ID
        }, headers={"X-Admin-Key": ADMIN_KEY})
        policy_rl_id = resp.json()["id"]

        # 3. Create Token
        print("Creating token...")
        resp = client.post("/tokens", json={
            "name": "demo-app-token",
            "credential_id": cred_id,
            "policy_ids": [policy_rl_id],
            "upstream_url": "http://mock-upstream:80/anything", # httpbin /anything echoes request
            "project_id": DEFAULT_PROJECT_ID
        }, headers={"X-Admin-Key": ADMIN_KEY})
        token_id = resp.json()["token_id"]
        
        # 4. Generate Traffic (50 requests)
        print("Generating traffic (50 requests)...")
        headers = {"Authorization": f"Bearer {token_id}"}
        
        statuses = [200] * 40 + [429] * 5 + [500] * 5
        random.shuffle(statuses)
        
        for i, status in enumerate(statuses):
            # Simulate latency
            # We can't easily force latency on the mock upstream unless it supports it
            # But the gateway adds overhead.
            # We can try to hit a non-existent upstream for 502/504?
            
            payload = {"prompt": "Hello world"}
            
            try:
                # We use a header to tell our mock upstream (if compatible) or just rely on standard path
                # For this demo, we just hit the gateway. 
                # If mock-upstream is running (from docker-compose), it returns 200.
                
                # To simulate errors, we might need a specific path or token configuration?
                # Or we just let them all be 200 for now, maybe the mock upstream is simple.
                
                # Attempt to inject latency header if mock supports it?
                # Actually, let's just send requests.
                
                client.post(GATEWAY_URL + "/proxy/v1/chat/completions", json=payload, headers=headers)
                print(".", end="", flush=True)
            except Exception as e:
                print("x", end="", flush=True)
            
            if i % 10 == 0:
                time.sleep(0.1)

        print("\nTraffic generated.")

        # 5. Create HITL Policy and Request
        print("Creating HITL request...")
        resp = client.post("/policies", json={
            "name": "human-approval-required",
            "mode": "enforce",
            "rules": [
                {"type": "human_approval", "timeout": "10m", "fallback": "deny"}
            ],
            "project_id": DEFAULT_PROJECT_ID
        }, headers={"X-Admin-Key": ADMIN_KEY})
        policy_hitl_id = resp.json()["id"]

        resp = client.post("/tokens", json={
            "name": "sensitive-ops-token",
            "credential_id": cred_id,
            "policy_ids": [policy_hitl_id],
            "upstream_url": "http://mock-upstream:80",
            "project_id": DEFAULT_PROJECT_ID
        }, headers={"X-Admin-Key": ADMIN_KEY})
        hitl_token = resp.json()["token_id"]

        # Trigger HITL (asynchronously, don't wait for result)
        # We use a separate thread or just a very short timeout that we expect to fail/ignore
        try:
            client.post("/proxy/v1/sensitive", json={"cmd":"nuke"}, headers={"Authorization": f"Bearer {hitl_token}"}, timeout=0.1)
        except httpx.TimeoutException:
            pass # Expected, as it blocks
        except Exception as e:
            print(f"HITL trigger error: {e}")

        print("HITL request created.")
        print("✅ DONE. Dashboard should be clean and populated.")

if __name__ == "__main__":
    seed()
