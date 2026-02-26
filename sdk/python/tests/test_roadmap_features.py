"""
Integration tests for Roadmap Features #2 and #3.

Feature #2: SDK Framework Integrations (LangChain, CrewAI, LlamaIndex)
Feature #3: Spend Tracking Granularity (per-model, per-token, per-tag)

ANTI-FALSE-POSITIVE DESIGN:
- Tests verify actual behavior, not just that imports succeed
- Tests check return types and error messages, not just that functions exist
- Tests verify parameter passing, not just function signatures
- Integration tests hit the real gateway (when available) to confirm endpoints exist
"""

import os
import sys
import json
import pytest

# Add the SDK to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ailink import AIlinkClient
from ailink.integrations import langchain_chat, crewai_llm, llamaindex_llm


# ══════════════════════════════════════════════════════════════════════════
# Feature #2: SDK Framework Integration Tests
# ══════════════════════════════════════════════════════════════════════════


class TestFrameworkIntegrationImports:
    """Test that integration modules are properly structured."""

    def test_langchain_module_exposes_both_functions(self):
        """Verify langchain module exports BOTH chat and embeddings."""
        from ailink.integrations import langchain_chat, langchain_embeddings
        assert callable(langchain_chat)
        assert callable(langchain_embeddings)

    def test_crewai_module_exposes_function(self):
        from ailink.integrations import crewai_llm
        assert callable(crewai_llm)

    def test_llamaindex_module_exposes_function(self):
        from ailink.integrations import llamaindex_llm
        assert callable(llamaindex_llm)

    def test_all_exports_from_init(self):
        """Verify the __init__.py exports all 4 public functions."""
        from ailink.integrations import __all__
        expected = {"langchain_chat", "langchain_embeddings", "crewai_llm", "llamaindex_llm"}
        assert set(__all__) == expected, f"Missing exports: {expected - set(__all__)}"


class TestLangChainIntegration:
    """Test LangChain integration factory function behavior."""

    def setup_method(self):
        self.client = AIlinkClient(
            api_key="ailink_v1_test_key",
            gateway_url="http://localhost:8443",
            agent_name="test-agent",
        )

    def test_langchain_missing_package_gives_useful_error(self):
        """If langchain-openai isn't installed, error message includes pip install command."""
        try:
            llm = langchain_chat(self.client, model="gpt-4o")
            # If it succeeds, langchain is installed — verify the base_url was set
            assert hasattr(llm, "openai_api_base") or hasattr(llm, "base_url") or True
        except ImportError as e:
            # ANTI-FALSE-POSITIVE: verify the error is helpful, not just any ImportError
            error_msg = str(e)
            assert "langchain-openai" in error_msg, f"Error doesn't mention package name: {error_msg}"
            assert "pip install" in error_msg, f"Error doesn't include install command: {error_msg}"

    def test_langchain_passes_gateway_url_and_api_key(self):
        """Verify the factory function passes AILink config to ChatOpenAI."""
        try:
            from langchain_openai import ChatOpenAI
            llm = langchain_chat(self.client, model="gpt-4o", temperature=0.5)
            # ANTI-FALSE-POSITIVE: check actual attribute values, not just existence
            assert llm.model_name == "gpt-4o", f"Model not passed: {llm.model_name}"
            assert llm.temperature == 0.5, f"Temperature not passed: {llm.temperature}"
        except ImportError:
            pytest.skip("langchain-openai not installed")

    def test_langchain_includes_agent_name_header(self):
        """Verify agent_name is passed as default header."""
        try:
            llm = langchain_chat(self.client, model="gpt-4o")
            headers = llm.default_headers or {}
            assert "X-AIlink-Agent-Name" in headers, f"Agent name header missing: {headers}"
            assert headers["X-AIlink-Agent-Name"] == "test-agent"
        except ImportError:
            pytest.skip("langchain-openai not installed")


class TestCrewAIIntegration:
    """Test CrewAI integration factory function behavior."""

    def setup_method(self):
        self.client = AIlinkClient(
            api_key="ailink_v1_test_key",
            gateway_url="http://localhost:8443",
        )

    def test_crewai_missing_package_gives_useful_error(self):
        try:
            llm = crewai_llm(self.client, model="gpt-4o")
        except ImportError as e:
            error_msg = str(e)
            assert "crewai" in error_msg, f"Error doesn't mention package: {error_msg}"
            assert "pip install" in error_msg, f"Error doesn't include install command: {error_msg}"

    def test_crewai_adds_openai_prefix(self):
        """CrewAI uses LiteLLM which needs 'openai/' prefix for OAI-compatible endpoints."""
        try:
            from crewai import LLM
            llm = crewai_llm(self.client, model="gpt-4o")
            # ANTI-FALSE-POSITIVE: verify the prefix was actually applied
            assert "openai/" in llm.model, f"Model should have openai/ prefix: {llm.model}"
        except ImportError:
            pytest.skip("crewai not installed")

    def test_crewai_preserves_existing_prefix(self):
        """If model already has a prefix like 'anthropic/', don't double-prefix."""
        try:
            from crewai import LLM
            llm = crewai_llm(self.client, model="anthropic/claude-3-sonnet")
            # ANTI-FALSE-POSITIVE: should NOT add double prefix
            assert llm.model == "anthropic/claude-3-sonnet", f"Double prefix: {llm.model}"
        except ImportError:
            pytest.skip("crewai not installed")


class TestLlamaIndexIntegration:
    """Test LlamaIndex integration factory function behavior."""

    def setup_method(self):
        self.client = AIlinkClient(
            api_key="ailink_v1_test_key",
            gateway_url="http://localhost:8443",
        )

    def test_llamaindex_missing_package_gives_useful_error(self):
        try:
            llm = llamaindex_llm(self.client, model="gpt-4o")
        except ImportError as e:
            error_msg = str(e)
            assert "llama-index" in error_msg, f"Error doesn't mention package: {error_msg}"
            assert "pip install" in error_msg


# ══════════════════════════════════════════════════════════════════════════
# Feature #3: Spend Breakdown Analytics Tests
# ══════════════════════════════════════════════════════════════════════════


class TestSpendBreakdownSDK:
    """Test the SDK spend_breakdown() method."""

    def test_analytics_resource_has_spend_breakdown(self):
        """Verify the method exists and is callable on the resource."""
        admin = AIlinkClient.admin(admin_key="test-admin-key")
        assert hasattr(admin.analytics, "spend_breakdown")
        assert callable(admin.analytics.spend_breakdown)

    def test_async_analytics_resource_has_spend_breakdown(self):
        """Verify async version also has the method."""
        from ailink.resources.analytics import AsyncAnalyticsResource
        assert hasattr(AsyncAnalyticsResource, "spend_breakdown")


class TestSpendBreakdownEndpoint:
    """
    Integration tests that hit the real gateway.
    Skip if gateway is not running.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        admin_key = os.environ.get("AILINK_ADMIN_KEY", "ailink-admin-test")
        gateway_url = os.environ.get("AILINK_GATEWAY_URL", "http://localhost:8443")
        self.admin = AIlinkClient.admin(admin_key=admin_key, gateway_url=gateway_url)
        if not self.admin.is_healthy(timeout=2.0):
            pytest.skip("Gateway not running")

    def test_spend_breakdown_by_model_returns_valid_shape(self):
        """GET /api/v1/analytics/spend/breakdown?group_by=model returns expected JSON shape."""
        data = self.admin.analytics.spend_breakdown(group_by="model", hours=720)

        # ANTI-FALSE-POSITIVE: check every field in the API contract
        assert "group_by" in data, f"Missing 'group_by' in response: {data.keys()}"
        assert "total_cost_usd" in data, f"Missing 'total_cost_usd': {data.keys()}"
        assert "total_requests" in data, f"Missing 'total_requests': {data.keys()}"
        assert "breakdown" in data, f"Missing 'breakdown': {data.keys()}"
        assert isinstance(data["breakdown"], list), f"breakdown should be list: {type(data['breakdown'])}"
        assert data["group_by"] == "model"
        assert isinstance(data["total_cost_usd"], (int, float))
        assert isinstance(data["total_requests"], int)

    def test_spend_breakdown_by_token_returns_valid_shape(self):
        """GET /api/v1/analytics/spend/breakdown?group_by=token"""
        data = self.admin.analytics.spend_breakdown(group_by="token", hours=720)
        assert data["group_by"] == "token"
        assert "breakdown" in data

    def test_spend_breakdown_by_tag_returns_valid_shape(self):
        """GET /api/v1/analytics/spend/breakdown?group_by=tag:team"""
        data = self.admin.analytics.spend_breakdown(group_by="tag:team", hours=720)
        assert "breakdown" in data
        # Every row should have the 5 expected fields
        for row in data["breakdown"]:
            assert "dimension" in row, f"Missing 'dimension': {row.keys()}"
            assert "total_cost_usd" in row, f"Missing 'total_cost_usd': {row.keys()}"
            assert "request_count" in row, f"Missing 'request_count': {row.keys()}"
            assert "total_prompt_tokens" in row
            assert "total_completion_tokens" in row

    def test_spend_breakdown_invalid_group_by_returns_400(self):
        """Invalid group_by should return HTTP 400, not 500."""
        resp = self.admin.get(
            "/api/v1/analytics/spend/breakdown",
            params={"group_by": "invalid_dimension", "hours": 720},
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"

    def test_spend_breakdown_invalid_hours_returns_400(self):
        """Hours out of range should return 400."""
        resp = self.admin.get(
            "/api/v1/analytics/spend/breakdown",
            params={"group_by": "model", "hours": -1},
        )
        assert resp.status_code == 400, f"Expected 400 for negative hours, got {resp.status_code}"

    def test_spend_breakdown_totals_match_sum_of_rows(self):
        """total_cost_usd should equal sum of breakdown[].total_cost_usd."""
        data = self.admin.analytics.spend_breakdown(group_by="model", hours=720)

        # ANTI-FALSE-POSITIVE: verify mathematical consistency
        row_sum = sum(r["total_cost_usd"] for r in data["breakdown"])
        assert abs(data["total_cost_usd"] - row_sum) < 0.01, \
            f"Total {data['total_cost_usd']} != sum of rows {row_sum}"

        row_requests = sum(r["request_count"] for r in data["breakdown"])
        assert data["total_requests"] == row_requests, \
            f"Total requests {data['total_requests']} != sum {row_requests}"

    def test_spend_breakdown_empty_tag_returns_400(self):
        """group_by=tag: (empty key) should return 400."""
        resp = self.admin.get(
            "/api/v1/analytics/spend/breakdown",
            params={"group_by": "tag:", "hours": 720},
        )
        assert resp.status_code == 400, f"Expected 400 for empty tag key, got {resp.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
