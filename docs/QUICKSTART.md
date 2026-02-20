# AILink Quickstart Guide

This guide will walk you through setting up AILink, configuring your first credential, creating a policy, and making your first proxied request.

## 1. Start the Stack

AILink is deployed via Docker Compose. Ensure you have Docker installed.

```bash
git clone https://github.com/sujan174/ailink.git
cd ailink
docker compose up -d
```

This starts:
- **Dashboard** (Port 3000)
- **Gateway** (Port 8443)
- **Postgres** (Database)
- **Redis** (Caching/Rate Limiting)
- **Jaeger** (Tracing)

## 2. Access the Dashboard

Navigate to [http://localhost:3000](http://localhost:3000).

You will be asked for a Dashboard Admin Key. By default (in `docker-compose.yml`), use:
```
ailink-admin-test
```

## 3. The "Zero to Aha!" Flow

AILink acts as the secure middleman between your application and AI providers (like OpenAI or Anthropic). Let’s set up your first route.

### Step A: Add a Credential
1. Go to **Credentials** in the sidebar.
2. Click **Add Credential**.
3. Name it (e.g., `My OpenAI Key`).
4. Select the provider (e.g., `OpenAI`).
5. Paste your *real* OpenAI API key (`sk-...`). 
> **Note:** This key is encrypted and stored in AILink's vault. Your application will never see this key.

### Step B: Create a Policy
Policies define rules for the traffic passing through AILink.
1. Go to **Policies**.
2. Click **Create Policy**.
3. Choose a template (e.g., **A/B Model Split**) or write a custom condition.
4. Save the policy. 

### Step C: Generate a Virtual Token
1. Go to **Tokens**.
2. Click **Create Token**.
3. Name it (e.g., `Dev Environment Token`).
4. Select the **Credential** you created in Step A.
5. Apply the **Policy** you created in Step B.
6. Click Save and **copy the generated Token ID** (it starts with `ailink_v1_...`).

## 4. Make Your First Request

Now you can use AILink as a drop-in replacement for any standard AI SDK. AILink intercepts your request, evaluates your policies, injects your real API key, and forwards it to the provider!

### Python Example
Install the SDK:
```bash
pip install ailink
```

Run your code:
```python
from ailink import AIlinkClient

# Use the virtual token you generated in Step C
client = AIlinkClient(api_key="ailink_v1_YOUR_TOKEN_HERE")

# The AILink python client acts as a drop-in wrapper around the standard OpenAI client
oai = client.openai()

response = oai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello AILink!"}]
)

print(response.choices[0].message.content)
```

### cURL Example
```bash
curl -X POST http://localhost:8443/v1/chat/completions \
  -H "Authorization: Bearer ailink_v1_YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello AILink!"}]
  }'
```

## 5. Explore the Results!
Go back to your Dashboard at [http://localhost:3000](http://localhost:3000):
- **Audit Logs:** See exactly what prompt was sent, which policy approved it, and the latency.
- **Analytics:** View token usage and estimated cost charts.
- **Experiments:** If you used the A/B Split policy, compare model latency and cost metrics!

## Moving to Production
When you're ready to deploy AILink for real traffic:
- Update the default secrets in `docker-compose.yml`.
- See the [Deployment Guide](DEPLOYMENT.md) for more robust hosting details.
