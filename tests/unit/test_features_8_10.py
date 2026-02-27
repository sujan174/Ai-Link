"""
AIlink SDK — Feature 10 Tests: Batches & Fine-tuning Resources
==============================================================

Mocked unit tests for the Batches and Fine-tuning SDK resources.
Follows the same conventions as test_unit.py: httpx.MockTransport
handlers, class-based test groups, assertion of correct HTTP method,
URL path, request body, and return types.

Does NOT require a running Gateway.
"""

import json
import pytest
import httpx

from ailink import AIlinkClient, AsyncClient


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def make_client(**kwargs) -> AIlinkClient:
    """Create a client with a MockTransport."""
    return AIlinkClient(api_key="ailink_v1_test", **kwargs)


# ──────────────────────────────────────────────
# 1. Batches Resource — Sync
# ──────────────────────────────────────────────


class TestBatchesResource:
    """Tests for client.batches (sync)."""

    def test_create_batch(self):
        """batches.create() sends POST /v1/batches with correct payload."""
        def handler(request):
            assert request.method == "POST"
            assert request.url.path == "/v1/batches"
            data = json.loads(request.read())
            assert data["input_file_id"] == "file-abc123"
            assert data["endpoint"] == "/v1/chat/completions"
            assert data["completion_window"] == "24h"
            return httpx.Response(200, json={
                "id": "batch_abc123",
                "object": "batch",
                "status": "validating",
                "input_file_id": "file-abc123",
                "endpoint": "/v1/chat/completions",
                "completion_window": "24h",
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.batches.create(
            input_file_id="file-abc123",
            endpoint="/v1/chat/completions",
            completion_window="24h",
        )
        assert result["id"] == "batch_abc123"
        assert result["status"] == "validating"
        assert result["endpoint"] == "/v1/chat/completions"

    def test_create_batch_with_metadata(self):
        """batches.create() passes metadata when provided."""
        def handler(request):
            data = json.loads(request.read())
            assert data["metadata"]["env"] == "staging"
            assert data["metadata"]["team"] == "ml-ops"
            return httpx.Response(200, json={"id": "batch_meta", "status": "validating"})

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.batches.create(
            input_file_id="file-xyz",
            endpoint="/v1/embeddings",
            metadata={"env": "staging", "team": "ml-ops"},
        )
        assert result["id"] == "batch_meta"

    def test_retrieve_batch(self):
        """batches.retrieve() sends GET /v1/batches/{batch_id}."""
        def handler(request):
            assert request.method == "GET"
            assert "/v1/batches/batch_abc123" in str(request.url)
            return httpx.Response(200, json={
                "id": "batch_abc123",
                "status": "completed",
                "output_file_id": "file-output-xyz",
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.batches.retrieve("batch_abc123")
        assert result["id"] == "batch_abc123"
        assert result["status"] == "completed"
        assert result["output_file_id"] == "file-output-xyz"

    def test_list_batches(self):
        """batches.list() sends GET /v1/batches with pagination params."""
        def handler(request):
            assert request.method == "GET"
            assert request.url.path == "/v1/batches"
            assert "limit=5" in str(request.url)
            return httpx.Response(200, json={
                "object": "list",
                "data": [
                    {"id": "batch_1", "status": "completed"},
                    {"id": "batch_2", "status": "in_progress"},
                ],
                "has_more": False,
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.batches.list(limit=5)
        assert result["object"] == "list"
        assert len(result["data"]) == 2
        assert result["data"][0]["id"] == "batch_1"

    def test_list_batches_with_after(self):
        """batches.list(after=...) sends cursor for pagination."""
        def handler(request):
            assert "after=batch_1" in str(request.url)
            return httpx.Response(200, json={"object": "list", "data": [], "has_more": False})

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.batches.list(after="batch_1", limit=10)
        assert result["data"] == []

    def test_cancel_batch(self):
        """batches.cancel() sends POST /v1/batches/{batch_id}/cancel."""
        def handler(request):
            assert request.method == "POST"
            assert "/v1/batches/batch_abc123/cancel" in str(request.url)
            return httpx.Response(200, json={
                "id": "batch_abc123",
                "status": "cancelling",
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.batches.cancel("batch_abc123")
        assert result["status"] == "cancelling"


# ──────────────────────────────────────────────
# 2. Fine-tuning Resource — Sync
# ──────────────────────────────────────────────


class TestFineTuningResource:
    """Tests for client.fine_tuning (sync)."""

    def test_create_job(self):
        """fine_tuning.create_job() sends POST /v1/fine_tuning/jobs with correct payload."""
        def handler(request):
            assert request.method == "POST"
            assert request.url.path == "/v1/fine_tuning/jobs"
            data = json.loads(request.read())
            assert data["model"] == "gpt-4o-mini"
            assert data["training_file"] == "file-train-123"
            return httpx.Response(200, json={
                "id": "ftjob-abc123",
                "object": "fine_tuning.job",
                "model": "gpt-4o-mini",
                "status": "validating_files",
                "training_file": "file-train-123",
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.create_job(
            model="gpt-4o-mini",
            training_file="file-train-123",
        )
        assert result["id"] == "ftjob-abc123"
        assert result["status"] == "validating_files"
        assert result["model"] == "gpt-4o-mini"

    def test_create_job_with_all_options(self):
        """fine_tuning.create_job() sends all optional parameters."""
        def handler(request):
            data = json.loads(request.read())
            assert data["model"] == "gpt-4o-mini"
            assert data["training_file"] == "file-train"
            assert data["validation_file"] == "file-val"
            assert data["hyperparameters"]["n_epochs"] == 3
            assert data["suffix"] == "custom-model-v2"
            assert data["seed"] == 42
            return httpx.Response(200, json={"id": "ftjob-full", "status": "queued"})

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.create_job(
            model="gpt-4o-mini",
            training_file="file-train",
            validation_file="file-val",
            hyperparameters={"n_epochs": 3},
            suffix="custom-model-v2",
            seed=42,
        )
        assert result["id"] == "ftjob-full"

    def test_list_jobs(self):
        """fine_tuning.list_jobs() sends GET /v1/fine_tuning/jobs with pagination."""
        def handler(request):
            assert request.method == "GET"
            assert request.url.path == "/v1/fine_tuning/jobs"
            assert "limit=10" in str(request.url)
            return httpx.Response(200, json={
                "object": "list",
                "data": [
                    {"id": "ftjob-1", "status": "succeeded"},
                    {"id": "ftjob-2", "status": "running"},
                ],
                "has_more": True,
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.list_jobs(limit=10)
        assert len(result["data"]) == 2
        assert result["has_more"] is True
        assert result["data"][0]["status"] == "succeeded"

    def test_get_job(self):
        """fine_tuning.get_job() sends GET /v1/fine_tuning/jobs/{id}."""
        def handler(request):
            assert request.method == "GET"
            assert "/v1/fine_tuning/jobs/ftjob-abc123" in str(request.url)
            return httpx.Response(200, json={
                "id": "ftjob-abc123",
                "status": "succeeded",
                "fine_tuned_model": "ft:gpt-4o-mini:org::id",
                "trained_tokens": 12500,
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.get_job("ftjob-abc123")
        assert result["fine_tuned_model"] == "ft:gpt-4o-mini:org::id"
        assert result["trained_tokens"] == 12500

    def test_cancel_job(self):
        """fine_tuning.cancel_job() sends POST /v1/fine_tuning/jobs/{id}/cancel."""
        def handler(request):
            assert request.method == "POST"
            assert "/v1/fine_tuning/jobs/ftjob-abc123/cancel" in str(request.url)
            return httpx.Response(200, json={"id": "ftjob-abc123", "status": "cancelled"})

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.cancel_job("ftjob-abc123")
        assert result["status"] == "cancelled"

    def test_list_events(self):
        """fine_tuning.list_events() sends GET /v1/fine_tuning/jobs/{id}/events."""
        def handler(request):
            assert request.method == "GET"
            assert "/v1/fine_tuning/jobs/ftjob-abc123/events" in str(request.url)
            assert "limit=5" in str(request.url)
            return httpx.Response(200, json={
                "object": "list",
                "data": [
                    {"object": "fine_tuning.job.event", "type": "message", "message": "Training started"},
                    {"object": "fine_tuning.job.event", "type": "metrics", "data": {"loss": 0.234}},
                ],
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.list_events("ftjob-abc123", limit=5)
        assert len(result["data"]) == 2
        assert result["data"][0]["message"] == "Training started"

    def test_list_checkpoints(self):
        """fine_tuning.list_checkpoints() sends GET /v1/fine_tuning/jobs/{id}/checkpoints."""
        def handler(request):
            assert request.method == "GET"
            assert "/v1/fine_tuning/jobs/ftjob-abc123/checkpoints" in str(request.url)
            return httpx.Response(200, json={
                "object": "list",
                "data": [
                    {"id": "ftckpt-1", "step_number": 100, "fine_tuned_model_checkpoint": "ft:gpt-4o-mini:ckpt-1"},
                ],
            })

        client = make_client(transport=httpx.MockTransport(handler))
        result = client.fine_tuning.list_checkpoints("ftjob-abc123")
        assert len(result["data"]) == 1
        assert result["data"][0]["step_number"] == 100


# ──────────────────────────────────────────────
# 3. Batches Resource — Async
# ──────────────────────────────────────────────


@pytest.mark.anyio
class TestAsyncBatchesResource:
    """Tests for async_client.batches."""

    async def test_async_create_batch(self):
        """Async batches.create() sends correct request."""
        async def handler(request):
            data = json.loads(request.read())
            assert data["input_file_id"] == "file-async-123"
            return httpx.Response(200, json={"id": "batch_async_1", "status": "validating"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.batches.create(
                input_file_id="file-async-123",
                endpoint="/v1/chat/completions",
            )
            assert result["id"] == "batch_async_1"

    async def test_async_retrieve_batch(self):
        """Async batches.retrieve() sends correct request."""
        async def handler(request):
            assert "/v1/batches/batch_xyz" in str(request.url)
            return httpx.Response(200, json={"id": "batch_xyz", "status": "completed"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.batches.retrieve("batch_xyz")
            assert result["status"] == "completed"

    async def test_async_list_batches(self):
        """Async batches.list() with pagination."""
        async def handler(request):
            assert "limit=3" in str(request.url)
            return httpx.Response(200, json={"data": [{"id": "b1"}, {"id": "b2"}], "has_more": False})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.batches.list(limit=3)
            assert len(result["data"]) == 2

    async def test_async_cancel_batch(self):
        """Async batches.cancel() sends correct request."""
        async def handler(request):
            assert request.method == "POST"
            return httpx.Response(200, json={"id": "batch_cancel", "status": "cancelling"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.batches.cancel("batch_cancel")
            assert result["status"] == "cancelling"


# ──────────────────────────────────────────────
# 4. Fine-tuning Resource — Async
# ──────────────────────────────────────────────


@pytest.mark.anyio
class TestAsyncFineTuningResource:
    """Tests for async_client.fine_tuning."""

    async def test_async_create_job(self):
        """Async fine_tuning.create_job() sends correct request."""
        async def handler(request):
            data = json.loads(request.read())
            assert data["model"] == "gpt-4o-mini"
            assert data["training_file"] == "file-async-train"
            return httpx.Response(200, json={"id": "ftjob-async", "status": "queued"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.fine_tuning.create_job(
                model="gpt-4o-mini",
                training_file="file-async-train",
            )
            assert result["id"] == "ftjob-async"

    async def test_async_get_job(self):
        """Async fine_tuning.get_job() sends correct request."""
        async def handler(request):
            assert "/v1/fine_tuning/jobs/ftjob-123" in str(request.url)
            return httpx.Response(200, json={"id": "ftjob-123", "status": "running"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.fine_tuning.get_job("ftjob-123")
            assert result["status"] == "running"

    async def test_async_cancel_job(self):
        """Async fine_tuning.cancel_job() sends correct request."""
        async def handler(request):
            assert request.method == "POST"
            assert "/cancel" in str(request.url)
            return httpx.Response(200, json={"id": "ftjob-del", "status": "cancelled"})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.fine_tuning.cancel_job("ftjob-del")
            assert result["status"] == "cancelled"

    async def test_async_list_events(self):
        """Async fine_tuning.list_events() sends correct request."""
        async def handler(request):
            assert "/events" in str(request.url)
            return httpx.Response(200, json={"data": [{"message": "Step 10 done"}]})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.fine_tuning.list_events("ftjob-123")
            assert result["data"][0]["message"] == "Step 10 done"

    async def test_async_list_checkpoints(self):
        """Async fine_tuning.list_checkpoints() sends correct request."""
        async def handler(request):
            assert "/checkpoints" in str(request.url)
            return httpx.Response(200, json={"data": [{"step_number": 500}]})

        transport = httpx.MockTransport(handler)
        async with AsyncClient(api_key="test", transport=transport) as client:
            result = await client.fine_tuning.list_checkpoints("ftjob-123")
            assert result["data"][0]["step_number"] == 500


# ──────────────────────────────────────────────
# 5. Resource Wiring — Lazy Loading
# ──────────────────────────────────────────────


class TestResourceWiring:
    """Verify that batches and fine_tuning resources are accessible on clients."""

    def test_sync_client_has_batches(self):
        """Sync client exposes client.batches as a cached_property."""
        client = AIlinkClient(api_key="key")
        from ailink.resources.batches import BatchesResource
        assert isinstance(client.batches, BatchesResource)

    def test_sync_client_has_fine_tuning(self):
        """Sync client exposes client.fine_tuning as a cached_property."""
        client = AIlinkClient(api_key="key")
        from ailink.resources.fine_tuning import FineTuningResource
        assert isinstance(client.fine_tuning, FineTuningResource)

    def test_async_client_has_batches(self):
        """Async client exposes client.batches as a cached_property."""
        client = AsyncClient(api_key="key")
        from ailink.resources.batches import AsyncBatchesResource
        assert isinstance(client.batches, AsyncBatchesResource)

    def test_async_client_has_fine_tuning(self):
        """Async client exposes client.fine_tuning as a cached_property."""
        client = AsyncClient(api_key="key")
        from ailink.resources.fine_tuning import AsyncFineTuningResource
        assert isinstance(client.fine_tuning, AsyncFineTuningResource)

    def test_batches_is_cached(self):
        """Accessing client.batches twice returns the same instance (cached_property)."""
        client = AIlinkClient(api_key="key")
        b1 = client.batches
        b2 = client.batches
        assert b1 is b2

    def test_fine_tuning_is_cached(self):
        """Accessing client.fine_tuning twice returns the same instance (cached_property)."""
        client = AIlinkClient(api_key="key")
        ft1 = client.fine_tuning
        ft2 = client.fine_tuning
        assert ft1 is ft2
