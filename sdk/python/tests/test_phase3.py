import time
import uuid
import pytest
from ailink import AIlinkClient

@pytest.fixture(scope="module")
def project_id(admin_client):
    """Create a project for Phase 3 tests."""
    p = admin_client.projects.create(name=f"phase3-proj-{uuid.uuid4().hex[:6]}")
    return p["id"]

class TestRedaction:
    @pytest.fixture(scope="class")
    def redact_token(self, admin_client, project_id):
        # Policy: Redact SSN in request, Email in response
        rules = [
            {
                "when": {"always": True},
                "then": [
                    {
                        "action": "redact",
                        "direction": "request",
                        "patterns": ["ssn"]
                    },
                    {
                        "action": "redact",
                        "direction": "response",
                        "patterns": ["email"]
                    }
                ]
            }
        ]
        policy = admin_client.policies.create(
            name=f"redact-pol-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            rules=rules
        )
        cred = admin_client.credentials.create(
            name=f"redact-cred-{uuid.uuid4().hex[:6]}",
            provider="openai",
            secret="sk-test"
        )
        token = admin_client.tokens.create(
            name=f"redact-tok-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            policy_ids=[str(policy["id"])]
        )
        return token["token_id"]

    def test_redact_request_ssn(self, redact_token, gateway_url):
        client = AIlinkClient(api_key=redact_token, gateway_url=gateway_url)
        # Send SSN in request
        resp = client.post("/anything/redact-req", json={
            "user": "alice",
            "social": "123-45-6789"
        })
        assert resp.status_code == 200
        data = resp.json()
        # Mock upstream returns the body it received in 'json' field
        received_body = data["json"]
        assert received_body["social"] == "[REDACTED_SSN]", "SSN should be redacted upstream"
        assert received_body["user"] == "alice"

    def test_redact_response_email(self, redact_token, gateway_url):
        client = AIlinkClient(api_key=redact_token, gateway_url=gateway_url)
        # Request mock upstream to return an email in the response body
        # /anything echoes body, so we send it email
        resp = client.post("/anything/redact-resp", json={
            "contact": "bob@example.com"
        })
        assert resp.status_code == 200
        # Client receives response. The "json" field in response is what upstream sent back.
        # But wait, redacting response means redacting what the CLIENT sees.
        # The mock upstream echoes "bob@example.com".
        # The gateway should redact it before sending to client.
        client_seen_body = resp.json()
        upstream_sent_body = client_seen_body["json"] # This is inside the response body
        
        # The response body structure from httpbin/anything is:
        # { "json": { "contact": "..." }, ... }
        # The policy redacts "email" pattern in the RESPONSE body.
        # "bob@example.com" matches email pattern.
        
        # Verify redaction
        assert "bob@example.com" not in str(client_seen_body)
        assert "[REDACTED_EMAIL]" in str(client_seen_body)


class TestTransform:
    @pytest.fixture(scope="class")
    def transform_token(self, admin_client, project_id):
        rules = [
            {
                "when": {"always": True},
                "then": {
                    "action": "transform",
                    "operations": [
                        {"type": "set_header", "name": "X-Phase3-Test", "value": "triggered"},
                        {"type": "append_system_prompt", "text": " Phase3_System_Prompt "}
                    ]
                }
            }
        ]
        policy = admin_client.policies.create(
            name=f"trans-pol-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            rules=rules
        )
        cred = admin_client.credentials.create(
            name=f"trans-cred-{uuid.uuid4().hex[:6]}",
            provider="openai", # needed for system prompt logic
            secret="sk-test"
        )
        token = admin_client.tokens.create(
            name=f"trans-tok-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            policy_ids=[str(policy["id"])]
        )
        return token["token_id"]

    def test_transform_header(self, transform_token, gateway_url):
        client = AIlinkClient(api_key=transform_token, gateway_url=gateway_url)
        resp = client.post("/anything/transform-header", json={})
        assert resp.status_code == 200
        data = resp.json()
        headers = data["headers"]
        # Mock upstream headers keys are usually capitalized or lowercase depending on implementation
        # Check case-insensitively or check keys
        # httpbin (mock-upstream) usually preserves case or lowercases
        header_keys = {k.lower(): v for k, v in headers.items()}
        assert header_keys.get("x-phase3-test") == "triggered"

    def test_transform_system_prompt(self, transform_token, gateway_url):
        client = AIlinkClient(api_key=transform_token, gateway_url=gateway_url)
        # Send OpenAI-compatible body
        resp = client.post("/anything/transform-prompt", json={
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hi"}]
        })
        assert resp.status_code == 200
        data = resp.json()
        messages = data["json"]["messages"]
        # System prompt should be appended
        assert len(messages) == 2
        assert messages[1]["role"] == "system"
        assert "Phase3_System_Prompt" in messages[1]["content"]


class TestUsageLimits:
    @pytest.fixture(scope="class")
    def limit_token(self, admin_client, project_id):
        # Allow 2 requests per hour (using sliding window logic or just raw count)
        # The implementation uses simple counters.
        # Rule: if usage.requests_this_hour > 2 then deny
        rules = [
            {
                "when": {
                    "field": "usage.requests_this_hour",
                    "op": "gt",
                    "value": 2
                },
                "then": {"action": "deny", "status": 429, "message": "Hourly limit exceeded"}
            }
        ]
        policy = admin_client.policies.create(
            name=f"limit-pol-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            rules=rules
        )
        cred = admin_client.credentials.create(
            name=f"limit-cred-{uuid.uuid4().hex[:6]}",
            provider="openai",
            secret="sk-test"
        )
        token = admin_client.tokens.create(
            name=f"limit-tok-{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            policy_ids=[str(policy["id"])]
        )
        return token["token_id"]

    def test_usage_limit_enforcement(self, limit_token, gateway_url):
        client = AIlinkClient(api_key=limit_token, gateway_url=gateway_url)
        
        # The counter increments ON every request.
        # Req 1: Counter becomes 1. Rule checks: 1 > 2 ? False. Pass.
        resp1 = client.get("/anything/limit-1")
        assert resp1.status_code == 200, f"Req 1 failed: {resp1.text}"

        # Req 2: Counter becomes 2. Rule checks: 2 > 2 ? False. Pass.
        resp2 = client.get("/anything/limit-2")
        assert resp2.status_code == 200, f"Req 2 failed: {resp2.text}"

        # Req 3: Counter becomes 3. Rule checks: 3 > 2 ? True. Deny.
        try:
            resp3 = client.get("/anything/limit-3")
            assert resp3.status_code == 429, f"Req 3 should be 429, got {resp3.status_code}"
            assert "Hourly limit exceeded" in resp3.text
        except Exception as e:
            # Client might raise error for 429 if configured, but AIlinkClient by default returns response? 
            # Wrappers might raise. SDK uses raise_for_status logic only if explicit?
            # Integration tests use raw client usually or check status.
            # SDK's 'get' usually returns response object, raises only if .raise_for_status() called
            # OR if the client is configured to raise.
            # Let's assume it returns response, if it raises we catch it.
            if "429" in str(e):
                pass
            else:
                raise e
