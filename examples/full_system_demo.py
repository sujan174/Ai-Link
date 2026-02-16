import os
import time
import uuid
import logging
import threading
import json
import httpx
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
GATEWAY_URL = "http://localhost:8443"
ADMIN_KEY = "ailink-admin-test"
MOCK_PORT = 9999

# Check for Real API Key
REAL_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")

class MockLLMHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len > 0:
            self.rfile.read(content_len)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        # Simulate different costs/latency?
        time.sleep(0.1) 

        response = {
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "gpt-4",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "Seeded Data Response"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 50,
                "completion_tokens": 50,
                "total_tokens": 100
            } # Cost ~ $0.003
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))
    
    def log_message(self, format, *args):
        pass

def start_mock_server():
    server = HTTPServer(('0.0.0.0', MOCK_PORT), MockLLMHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    return server

def setup_resources():
    admin_client = httpx.Client(base_url=GATEWAY_URL, headers={"X-Admin-Key": ADMIN_KEY})
    run_id = str(uuid.uuid4())[:8]

    # Credential
    cred_resp = admin_client.post("/api/v1/credentials", json={
        "name": f"seed-cred-{run_id}",
        "provider": "openai",
        "secret": "sk-test-dummy",
        "injection_mode": "bearer",
        "injection_header": "Authorization"
    })
    cred_id = cred_resp.json()["id"]

    # Policy 1: Analysis (High budget)
    p1_resp = admin_client.post("/api/v1/policies", json={
        "name": "High Budget Policy",
        "mode": "enforce",
        "rules": [
            { "type": "spend_cap", "window": "daily", "max_usd": 100.0 }
        ]
    })
    p1_id = p1_resp.json()["id"]

    # Policy 2: Testing (Low budget)
    p2_resp = admin_client.post("/api/v1/policies", json={
        "name": "Low Budget Policy",
        "mode": "enforce",
        "rules": [
            { "type": "spend_cap", "window": "daily", "max_usd": 0.01 }
        ]
    })
    p2_id = p2_resp.json()["id"]

    # Policy 3: HITL (Approval Required)
    # Ensure this matches backend expected format
    p3_resp = admin_client.post("/api/v1/policies", json={
        "name": "Manager Approval Required",
        "mode": "enforce",
        "rules": [
            { "type": "human_approval", "timeout": "60m", "fallback": "deny" }
        ]
    })
    p3_id = p3_resp.json()["id"]

    upstream_url = f"http://host.docker.internal:{MOCK_PORT}"

    # Token 1: High Budget
    t1_resp = admin_client.post("/api/v1/tokens", json={
        "name": "Production Token",
        "credential_id": cred_id,
        "policy_ids": [p1_id],
        "upstream_url": upstream_url
    })
    t1 = t1_resp.json()

    # Token 2: Low Budget
    t2_resp = admin_client.post("/api/v1/tokens", json={
        "name": "Test Token",
        "credential_id": cred_id,
        "policy_ids": [p2_id],
        "upstream_url": upstream_url
    })
    t2 = t2_resp.json()

    # Token 3: HITL
    t3_resp = admin_client.post("/api/v1/tokens", json={
        "name": "Sensitive Token",
        "credential_id": cred_id,
        "policy_ids": [p3_id], # Using p3_id!
        "upstream_url": upstream_url
    })
    t3 = t3_resp.json()

    return t1, t2, t3

def send_request(token, name):
    try:
        from openai import OpenAI
        client = OpenAI(base_url=f"{GATEWAY_URL}/v1", api_key=token)
        client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Hello"}]
        )
        # logger.info(f"Request via {name}: Success")
        return "success"
    except Exception as e:
        # logger.info(f"Request via {name}: Blocked/Error ({e})")
        if "402" in str(e): return "spend_limit"
        if "403" in str(e): return "policy_deny" # HITL might return this or hold? HITL holds!
        return "error"

def main():
    logger.info("Starting Mock Server...")
    start_mock_server()
    
    logger.info("Setting up Policies and Tokens...")
    t1, t2, t3 = setup_resources()
    
    logger.info("Generating Traffic...")
    
    # 1. Generate Success Traffic (Token 1)
    logger.info("  -> Sending 20 successful requests (Production Token)...")
    for _ in range(20):
        send_request(t1["token_id"], "Prod")
    
    # 2. Generate Spend Cap Blocks (Token 2)
    logger.info("  -> Sending requests to exhaust Low Budget Token...")
    # $0.01 limit. Each req $0.003. 4th req should fail.
    for i in range(10):
        res = send_request(t2["token_id"], "Test")
        if res == "spend_limit":
            logger.info(f"     Blocked at request {i+1} (Expected)")
    
    # 3. Generate Approvals (Token 3)
    logger.info("  -> Sending 3 requests needing Human Approval...")
    # These requests will hang or receive logic based on implementation. 
    # Gateway HITL holds connection? Or returns 202?
    # Usually it holds connection until timeout.
    # We should run these in threads so we don't block verifying the dashboard.
    
    def async_req():
        send_request(t3["token_id"], "Sensitive")

    for _ in range(3):
        threading.Thread(target=async_req).start()
    
    logger.info("Done! Dashboard should be populated.")
    logger.info(f"  - Production Token: {t1['name']}")
    logger.info(f"  - Test Token: {t2['name']}")
    logger.info(f"  - Sensitive Token: {t3['name']}")

if __name__ == "__main__":
    main()
