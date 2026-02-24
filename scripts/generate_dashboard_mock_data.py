import os
import time
import uuid
import random
from ailink import AIlinkClient

# Use localhost gateway
GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://127.0.0.1:8443")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "ailink-admin-test")
MOCK_UPSTREAM_URL = os.environ.get("MOCK_UPSTREAM_URL", "http://localhost:8080")

def generate_mock_data():
    print(f"Connecting to Gateway at: {GATEWAY_URL}")
    admin_client = AIlinkClient.admin(admin_key=ADMIN_KEY, gateway_url=GATEWAY_URL)
    
    # 1. Get or create project
    projects = admin_client.projects.list()
    if not projects:
        project = admin_client.projects.create(name="Demo Project")
    else:
        project = projects[0]
        
    project_id = str(project.id) if hasattr(project, 'id') else project["id"]
    print(f"Using Project ID: {project_id}")
    
    # 2. Setup Credentials and Tokens
    print("Setting up credentials and tokens...")
    try:
        cred = admin_client.credentials.create(
            name=f"openai-demo-{uuid.uuid4().hex[:6]}",
            provider="openai",
            secret="sk-mock-key-12345"
        )
        cred_id = str(cred.id) if hasattr(cred, 'id') else cred["id"]
    except Exception as e:
        print(f"Credential creation failed (maybe already exists): {e}")
        creds = admin_client.credentials.list()
        cred_id = str(creds[0].id) if hasattr(creds[0], 'id') else creds[0]["id"]
        
    try:
        token = admin_client.tokens.create(
            name=f"prod-token-{uuid.uuid4().hex[:6]}",
            credential_id=cred_id,
            project_id=project_id,
            upstream_url=MOCK_UPSTREAM_URL
        )
        api_key = token["token_id"] if isinstance(token, dict) else token.token_id
    except Exception as e:
        print(f"Token creation failed: {e}")
        return

    print("Tokens created successfully.")
    
    # 3. Create normal client
    client = AIlinkClient(api_key=api_key, gateway_url=GATEWAY_URL)
    
    # --- MOCK DATA GENERATION SCENARIOS ---
    
    print("Generating mock data scenarios...")
    
    def mock_headers(session_id=None, props=None, cost=None, prompt=None, completion=None, latency=None):
        h = {}
        if session_id: h["X-Session-ID"] = session_id
        if props: h["X-Properties"] = props
        if cost is not None: h["X-AILink-Test-Cost"] = str(cost)
        if prompt is not None and completion is not None: h["X-AILink-Test-Tokens"] = f"{prompt},{completion}"
        if latency is not None: h["X-AILink-Test-Latency"] = str(latency)
        return h
    
    # Scenario A: Simple single-step interactions
    print("Running single-step requests...")
    for model in ["gpt-4-turbo", "gpt-3.5-turbo", "claude-3-haiku"]:
        client.post(
            "/anything/chat",
            json={
                "model": model,
                "messages": [{"role": "user", "content": f"Tell me a short joke about {model}."}]
            },
            headers=mock_headers(cost=random.uniform(0.001, 0.05), prompt=random.randint(20, 100), completion=random.randint(50, 200), latency=random.randint(200, 1500))
        )
        time.sleep(0.5)
        
    # Scenario B: Multi-step Agent Session (Data extraction)
    print("Running multi-step agent session (extraction)...")
    extraction_session = f"agent-extract-{uuid.uuid4().hex[:8]}"
    with client.trace(
        session_id=extraction_session,
        properties={"agent_name": "DataExtractor", "env": "prod", "task": "pdf_parsing"}
    ) as t:
        # Step 1: Fast model for initial routing
        t.post("/anything", json={
            "model": "gpt-3.5-turbo",
            "messages": [{"role": "system", "content": "You are a router."}, {"role": "user", "content": "Document text..."}]
        }, headers=mock_headers(cost=0.0001, prompt=500, completion=10, latency=150))
        time.sleep(0.2)
        # Step 2: Powerful model for deep extraction
        t.post("/anything", json={
            "model": "gpt-4-turbo",
            "messages": [{"role": "system", "content": "Extract entities."}, {"role": "user", "content": "Complex text..."}]
        }, headers=mock_headers(cost=0.15, prompt=8000, completion=1500, latency=4500))
        time.sleep(0.3)
        # Step 3: Fast model for formatting
        t.post("/anything", json={
            "model": "gpt-3.5-turbo",
            "messages": [{"role": "system", "content": "Format as JSON"}, {"role": "user", "content": "Entities..."}]
        }, headers=mock_headers(cost=0.001, prompt=2000, completion=500, latency=800))

    # Scenario C: Long-running complex task with lots of requests
    print("Running long complex session...")
    complex_session = f"agent-coder-{uuid.uuid4().hex[:8]}"
    with client.trace(
        session_id=complex_session,
        properties={"agent_name": "DevinClone", "env": "staging", "user": "sujan"}
    ) as t:
        for i in range(5):
            t.post("/anything", json={
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": f"Write function part {i+1}..."}]
            })
            time.sleep(0.1)

    # Scenario D: Error/Policy blocked request (simulated via invalid body/route or just a big payload)
    print("Running request with large payload (to trigger S3 offload if configured)...")
    big_session = f"payload-test-{uuid.uuid4().hex[:8]}"
    large_text = "lorem ipsum " * 1000 # ~12KB
    client.post(
        "/anything",
        json={
            "model": "gpt-4",
            "messages": [{"role": "user", "content": large_text}]
        },
        headers={"X-Session-ID": big_session, "X-Properties": '{"type":"large_upload"}'}
    )

    print("✅ Mock data generation complete! Check the dashboard at http://localhost:3000")

if __name__ == "__main__":
    generate_mock_data()
