from ailink import AIlinkClient
import sys

# Example 3: A/B Testing Models (Split Action)
# 
# The Gateway can distribute traffic proportionally across different models
# (e.g. 50% gpt-4o, 50% claude-3.5-sonnet) while keeping the distribution
# consistent for the same session/agent.
#
# Prerequisites: 
# 1. Create a Token in the dashboard.
# 2. Attach the "A/B Model Split" template policy to your token.
# 3. Set the virtual token below:

AILINK_TOKEN = "ailink_v1_YOUR_TOKEN_HERE"

def run_ab_test():
    if AILINK_TOKEN.endswith("YOUR_TOKEN_HERE"):
        print("❌ Please set your AILINK_TOKEN in this script first.")
        sys.exit(1)

    print(f"🔗 Connecting to AILink Gateway...\n")
    client = AIlinkClient(api_key=AILINK_TOKEN)
    oai = client.openai()

    print("Sending 5 distinct requests. The AILink Split policy will")
    print("deterministically route them between the models defined in your policy.\n")
    
    for i in range(1, 6):
        print(f"[{i}/5] Sending request...", end="", flush=True)
        response = oai.chat.completions.create(
            # Notice we ask for 'gpt-4o-mini' here, but the Gateway's Split
            # policy will OVERRIDE this body field on the backend!
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": f"Hi! Identify your model name in one sentence. Request #{i}"}]
        )
        print(f" Done! -> {response.choices[0].message.content[:60]}...")
        
    print("\n✅ Test complete!")
    print("\n📊 Check your AILink dashboard (http://localhost:3000/experiments) to see:")
    print("The traffic and cost broken down by 'control' vs 'experiment' variants.")

if __name__ == "__main__":
    run_ab_test()
