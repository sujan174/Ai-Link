from ailink import AIlinkClient
import sys

# Example 2: Shadow Mode Logging
# 
# "Shadow Mode" allows you to test strict policies (like a content classifier 
# or a strict block rule) without actually dropping traffic. If a condition matches,
# the gateway executes the Action in the background (like adding a 'shadow-log' tag)
# but still allows the request to reach the LLM.
#
# Prerequisites: 
# 1. Create a Token in the dashboard.
# 2. Attach the "Shadow Logger" template policy to your token.
# 3. Set the virtual token below:

AILINK_TOKEN = "ailink_v1_YOUR_TOKEN_HERE"

def run_shadow_mode():
    if AILINK_TOKEN.endswith("YOUR_TOKEN_HERE"):
        print("❌ Please set your AILINK_TOKEN in this script first.")
        sys.exit(1)

    print(f"🔗 Connecting to AILink Gateway...")
    
    client = AIlinkClient(api_key=AILINK_TOKEN)
    oai = client.openai()

    print("\n🕵️ Sending request. Since your policy is in Shadow Mode,")
    print("this request will succeed, but the gateway will tag it silently.")
    
    response = oai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": "Tell me a joke about cyber security."}
        ]
    )

    print("\n✅ Response received (Request was NOT blocked):")
    print(response.choices[0].message.content)
    
    print("\n🔍 Now, open your dashboard Audit Logs.")
    print("You will see this request was tagged with 'shadow-test'.")
    print("If you change the policy mode from 'Shadow' to 'Enforce',")
    print("the gateway would block this identical request next time.")

if __name__ == "__main__":
    run_shadow_mode()
