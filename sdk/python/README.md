# AIlink Python SDK

Official Python client for the AIlink Gateway.

## Installation

```bash
pip install ailink
# For OpenAI support
pip install "ailink[openai]"
# For Anthropic support
pip install "ailink[anthropic]"
```

## Usage

### OpenAI

```python
import ailink

client = ailink.Client(
    api_key="ailink_v1_proj_...",
    gateway_url="http://localhost:8443"
)

# Get a configured OpenAI client
openai = client.openai()

response = openai.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello world"}]
)
print(response.choices[0].message.content)
```

### Anthropic

```python
# Get a configured Anthropic client
anthropic = client.anthropic()

response = anthropic.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1000,
    messages=[{"role": "user", "content": "Hello world"}]
)
print(response.content[0].text)
```

### Human-in-the-Loop (HITL) Management

Manage approval requests programmatically:

```python
# List pending requests
pending = client.approvals.list()

for req in pending:
    print(f"Approving request {req['id']} for {req['summary']['method']} {req['summary']['path']}")
    client.approvals.approve(req['id'])
    # Or client.approvals.reject(req['id'])
```
