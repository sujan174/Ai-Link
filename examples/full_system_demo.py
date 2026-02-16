"""
AIlink Full System Demo
=======================

Demonstrates the complete AIlink workflow using the Python SDK:

1. Create credentials, policies, and tokens via the admin API
2. Route agent requests through the gateway
3. Trigger spend cap enforcement
4. Trigger HITL approval flow

Requires:
  - Gateway running at http://localhost:8443 (`docker compose up -d`)
  - Optional: OPENAI_API_KEY env var for real upstream requests

Usage:
  python examples/full_system_demo.py
"""

import os
import time
import uuid
import json
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

from ailink import AIlinkClient

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Constants
GATEWAY_URL = "http://localhost:8443"
ADMIN_KEY = "ailink-admin-test"
MOCK_PORT = 9999


# ── Mock LLM Server ──────────────────────────────────────────


class MockLLMHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len > 0:
            self.rfile.read(content_len)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        time.sleep(0.1)

        response = {
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "gpt-4",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "Seeded Data Response"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 50,
                "completion_tokens": 50,
                "total_tokens": 100,
            },
        }
        self.wfile.write(json.dumps(response).encode("utf-8"))

    def log_message(self, format, *args):
        pass


def start_mock_server():
    server = HTTPServer(("0.0.0.0", MOCK_PORT), MockLLMHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    return server


# ── Setup Resources via SDK ───────────────────────────────────


def setup_resources(admin: AIlinkClient):
    """Create credentials, policies, and tokens using the SDK's admin API."""
    run_id = uuid.uuid4().hex[:8]
    upstream_url = f"http://host.docker.internal:{MOCK_PORT}"

    # 1. Create a credential (API key stored encrypted)
    cred = admin.credentials.create(
        name=f"seed-cred-{run_id}",
        provider="openai",
        secret="sk-test-dummy",
    )
    cred_id = str(cred["id"])
    logger.info(f"  Created credential: {cred['id']}")

    # 2. Create policies
    # High budget — allows lots of traffic
    # Rule 1: Allow request if spend < 100
    # Or simplified: Check usage > 100 -> Deny
    p1 = admin.policies.create(
        name="High Budget ($100)",
        mode="enforce",
        rules=[{
            "when": {"field": "usage.spend_today_usd", "op": "gt", "value": 100.0},
            "then": {"action": "deny", "status": 402, "message": "Daily spend limit reached ($100)"}
        }]
    )
    # Low budget — will trigger spend cap quickly
    p2 = admin.policies.create(
        name="Low Budget ($0.01)",
        mode="enforce",
        rules=[{
            "when": {"field": "usage.spend_today_usd", "op": "gt", "value": 0.01},
            "then": {"action": "deny", "status": 402, "message": "Low budget limit reached ($0.01)"}
        }]
    )
    # HITL — requires human approval for every request
    p3 = admin.policies.create(
        name="Manager Approval Required",
        mode="enforce",
        rules=[{
            "when": {"always": True},
            "then": {"action": "require_approval", "timeout": "1h", "fallback": "deny"}
        }]
    )
    logger.info(f"  Created 3 policies")

    # 3. Create tokens (one per policy)
    t1 = admin.tokens.create(
        name="Production Token",
        credential_id=cred_id,
        upstream_url=upstream_url,
        policy_ids=[str(p1["id"])],
    )
    t2 = admin.tokens.create(
        name="Test Token",
        credential_id=cred_id,
        upstream_url=upstream_url,
        policy_ids=[str(p2["id"])],
    )
    t3 = admin.tokens.create(
        name="Sensitive Token",
        credential_id=cred_id,
        upstream_url=upstream_url,
        policy_ids=[str(p3["id"])],
    )
    logger.info(f"  Created 3 tokens")

    return t1, t2, t3


# ── Send Requests via SDK ─────────────────────────────────────


def send_request(token_id: str, name: str) -> str:
    """Send a request through the gateway using the SDK's OpenAI factory."""
    try:
        agent = AIlinkClient(api_key=token_id, gateway_url=GATEWAY_URL)
        oai = agent.openai()
        oai.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Hello"}],
        )
        return "success"
    except Exception as e:
        if "402" in str(e):
            return "spend_limit"
        if "403" in str(e):
            return "policy_deny"
        return "error"


# ── Main ──────────────────────────────────────────────────────


def main():
    logger.info("Starting Mock Server...")
    start_mock_server()

    logger.info("Setting up Policies and Tokens via SDK...")
    admin = AIlinkClient.admin(admin_key=ADMIN_KEY, gateway_url=GATEWAY_URL)
    t1, t2, t3 = setup_resources(admin)

    logger.info("Generating Traffic...")

    # 1. Generate success traffic (high budget token)
    logger.info("  -> Sending 20 successful requests (Production Token)...")
    for _ in range(20):
        send_request(t1["token_id"], "Prod")

    # 2. Generate spend cap blocks (low budget token)
    logger.info("  -> Sending requests to exhaust Low Budget Token...")
    for i in range(10):
        res = send_request(t2["token_id"], "Test")
        if res == "spend_limit":
            logger.info(f"     Blocked at request {i + 1} (Expected)")

    # 3. Generate HITL approval requests (sensitive token)
    logger.info("  -> Sending 3 requests needing Human Approval...")

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
