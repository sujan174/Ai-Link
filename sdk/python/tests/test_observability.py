import uuid
import time
import pytest
from ailink import AIlinkClient

class TestObservability:
    @pytest.fixture(scope="class")
    def active_token(self, admin_client, project_id):
        """Create a credential + token for observability tests."""
        cred = admin_client.credentials.create(
            name=f"obs-cred-{uuid.uuid4().hex[:8]}",
            provider="openai",
            secret="sk-test",
        )
        token_resp = admin_client.tokens.create(
            name=f"obs-token-{uuid.uuid4().hex[:8]}",
            credential_id=str(cred["id"]),
            upstream_url="http://mock-upstream:80",
            project_id=project_id,
        )
        return token_resp["token_id"]

    def test_custom_properties_header(self, admin_client, active_token, gateway_url):
        """Requests with X-Properties map to custom_properties in the audit log."""
        session_id = f"test-session-{uuid.uuid4().hex[:8]}"
        marker = f"audit-obs-{uuid.uuid4().hex[:8]}"
        
        agent = AIlinkClient(api_key=active_token, gateway_url=gateway_url)
        
        # We manually inject the header here, but in real usage it's done via `with client.trace(properties=...)`
        agent.get(
            f"/anything/{marker}",
            headers={
                "X-Session-ID": session_id,
                "X-Properties": '{"env": "test", "version": "1.0", "is_retry": true}'
            }
        )
        time.sleep(1.5) # Wait for async logging

        logs = admin_client.audit.list(limit=50)
        
        # Find our specific log
        obs_log = next((log for log in logs if marker in log.path), None)
        assert obs_log is not None, f"Expected to find audit log with path containing '{marker}'"
        
        # Check custom properties
        assert obs_log.session_id == session_id
        
        # Since we haven't updated the Python SDK AuditLog model yet specifically for this test,
        # we bypass the Pydantic model by making a raw API call to get the detail
        log_detail_resp = admin_client.get(f"/api/v1/audit/{obs_log.id}")
        assert log_detail_resp.status_code == 200
        log_detail = log_detail_resp.json()
        
        assert "custom_properties" in log_detail
        assert log_detail["custom_properties"]["env"] == "test"
        assert log_detail["custom_properties"]["version"] == "1.0"
        assert log_detail["custom_properties"]["is_retry"] is True

    def test_sessions_api(self, admin_client, active_token, gateway_url):
        """Test GET /sessions and GET /sessions/:id endpoints."""
        session_id = f"api-session-{uuid.uuid4().hex[:8]}"
        agent = AIlinkClient(api_key=active_token, gateway_url=gateway_url)
        
        # Make a few requests for this session
        agent.post("/anything/step1", json={"prompt": "hello"}, headers={"X-Session-ID": session_id})
        agent.post("/anything/step2", json={"prompt": "world"}, headers={"X-Session-ID": session_id})
        time.sleep(1.5)
        
        # 1. Test List Sessions
        list_resp = admin_client.get("/api/v1/sessions")
        assert list_resp.status_code == 200
        sessions = list_resp.json()
        
        assert isinstance(sessions, list)
        
        # Find our session in the list
        my_session = next((s for s in sessions if s.get("session_id") == session_id), None)
        assert my_session is not None, "Session should appear in list_sessions"
        assert my_session["total_requests"] == 2
        assert "total_cost_usd" in my_session
        assert "total_prompt_tokens" in my_session
        assert "total_latency_ms" in my_session
        
        # 2. Test Get Session Detail
        detail_resp = admin_client.get(f"/api/v1/sessions/{session_id}")
        assert detail_resp.status_code == 200
        session_detail = detail_resp.json()
        
        assert session_detail["session_id"] == session_id
        assert session_detail["total_requests"] == 2
        assert len(session_detail["requests"]) == 2
        
        # Check request rows
        req1 = session_detail["requests"][0]
        assert "id" in req1
        assert "model" in req1
        assert "estimated_cost_usd" in req1
        assert "custom_properties" in req1
        assert "payload_url" in req1

    def test_trace_context_manager(self, admin_client, active_token, gateway_url):
        """Test the `with client.trace()` context manager correctly sets headers."""
        session_id = f"trace-ctx-{uuid.uuid4().hex[:8]}"
        marker = f"trace-test-{uuid.uuid4().hex[:8]}"
        
        agent = AIlinkClient(api_key=active_token, gateway_url=gateway_url)
        props = {"agent_step": "verification", "mode": "strict"}
        
        with agent.trace(session_id=session_id, properties=props) as t:
            t.get(f"/anything/{marker}")
            
        time.sleep(1.5)
        
        # Verify the log got the session ID and properties
        logs = admin_client.audit.list(limit=50)
        trace_log = next((log for log in logs if marker in log.path), None)
        assert trace_log is not None, "Trace log not found"
        assert trace_log.session_id == session_id
        
        log_detail_resp = admin_client.get(f"/api/v1/audit/{trace_log.id}")
        log_detail = log_detail_resp.json()
        assert log_detail["custom_properties"] == props
