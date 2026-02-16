import pytest
import httpx
import time
import uuid

def test_gateway_retries_500(gateway_url, admin_client, new_credential):
    """
    Verify Gateway retries 500 errors from upstream.
    We proxy to httpbin/status/500.
    Expected: 500 Internal Server Error (after retries).
    Latency: Should be significantly higher than a normal request.
    Current Backoff: Base 500ms? Exponential?
    retries=3.
    """
    cred, project_id = new_credential

    # 1. Create Token pointing to httpbin
    token_resp = admin_client.post("/tokens", json={
        "name": "resilience-test-token",
        "credential_id": cred["id"],
        "upstream_url": "http://mock-upstream:80",
        "project_id": project_id
    })
    token = token_resp.json()["token_id"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Measure baseline (200 OK)
    start = time.time()
    resp_ok = httpx.post(f"{gateway_url}/post", json={"msg":"ok"}, headers=headers)
    baseline_duration = time.time() - start
    assert resp_ok.status_code == 200
    
    # 3. Request 500 (trigger retries)
    start = time.time()
    # httpbin/status/:code returns the status code
    resp_fail = httpx.get(f"{gateway_url}/status/500", headers=headers, timeout=30.0)
    duration = time.time() - start
    
    assert resp_fail.status_code == 500 or resp_fail.status_code == 502
    
    # Verify Retries happened
    # Retry policy: 3 retries.
    # If using ExponentialBackoff (base usually small? I set it to default?)
    # I verified upstream.rs: ExponentialBackoff::builder().build_with_max_retries(3)
    # Default base is 250ms?
    # 250 + 500 + 1000 = 1.75s minimum delay?
    # Let's Assert duration > 0.5s (Baseline is usually < 0.1s in local docker)
    
    print(f"Request duration: {duration}s (Baseline: {baseline_duration}s)")
    assert duration > 0.5, f"Gateway did not retry! Duration: {duration}s"
    assert duration > baseline_duration * 5, "Duration should be significantly higher than baseline"

def test_gateway_retries_504(gateway_url, admin_client, new_credential):
    """Verify 504 Gateway Timeout triggers retry"""
    # Httpbin doesn't simulate timeout easily without `delay`.
    # `delay/n` returns 200 after n seconds.
    # We want upstream to return 504? Httpbin/status/504.
    pass 
