from ailink import AIlinkClient
import sys

# Example 1: Basic OpenAI Routing
# 
# This script demonstrates how AILink acts as a drop-in proxy for
# any standard OpenAI-compatible SDK. You initialize the AILink client
# with your generated virtual token (ailink_v1_...), and it configures
# the underlying OpenAI SDK to route through the gateway automatically.
#
# Prerequisites: 
# 1. Start the gateway (`docker compose up -d`)
# 2. Add an OpenAI credential in the dashboard.
# 3. Create a virtual token for that credential.
# 4. Set the virtual token as your AILink API key below:

AILINK_TOKEN = "ailink_v1_YOUR_TOKEN_HERE"

def run_basic_proxy():
    if AILINK_TOKEN.endswith("YOUR_TOKEN_HERE"):
        print("❌ Please set your AILINK_TOKEN in this script first.")
        sys.exit(1)

    print(f"🔗 Connecting to AILink Gateway with token: {AILINK_TOKEN[:15]}...")
    
    # 1. Initialize AILink
    client = AIlinkClient(api_key=AILINK_TOKEN)
    
    # 2. Get a pre-configured OpenAI client
    # This standard `openai` object is now pointing at your localhost gateway
    # and using your AILINK_TOKEN for authorization. The gateway will inject
    # the real OpenAI API key on the backend.
    oai = client.openai()

    print("\n🧠 Sending prompt to gpt-4o-mini...")
    
    # 3. Use standard OpenAI methods
    response = oai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Write a 2-sentence haiku about an API gateway."}
        ]
    )

    print("\n✅ Response received:")
    print("-" * 40)
    print(response.choices[0].message.content)
    print("-" * 40)
    
    print("\n📊 Check your AILink dashboard (http://localhost:3000) to see:")
    print("1. The request in the Audit Logs")
    print("2. The token usage and estimated cost")

if __name__ == "__main__":
    run_basic_proxy()
