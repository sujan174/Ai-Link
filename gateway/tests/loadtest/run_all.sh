#!/bin/bash
set -e

echo "============================================================"
echo " TrueFlow Gateway - Pre-Launch Load Testing Suite"
echo "============================================================"
echo ""
echo "This script runs all k6 load test scenarios sequentially."
echo "Ensure the following services are running:"
echo "  1. Postgres & Redis (docker compose up -d postgres redis)"
echo "  2. Mock Upstream on port 9000 (python tests/mock-upstream/server.py)"
echo "  3. Gateway on port 8082 (cargo run --bin trueflow serve --port 8082)"
echo ""

# Configuration
export BASE_URL="${BASE_URL:-http://localhost:8082}"
export TRUEFLOW_ADMIN_KEY="${TRUEFLOW_ADMIN_KEY:-tf_admin_dev_key_12345}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[Config] BASE_URL: $BASE_URL"
echo "[Config] ADMIN_KEY: ${TRUEFLOW_ADMIN_KEY:0:5}...${TRUEFLOW_ADMIN_KEY: -4}"
echo ""

cd "$DIR"

run_scenario() {
    local file=$1
    local name=$2
    echo "------------------------------------------------------------"
    echo "▶ RUNNING SCENARIO: $name ($file)"
    echo "------------------------------------------------------------"

    if k6 run "config/$file"; then
        echo "✅ SCENARIO PASSED: $name"
    else
        echo "❌ SCENARIO FAILED: $name"
        exit 1
    fi
    echo ""
    sleep 2 # Brief pause between scenarios
}

# Run the 4 core scenarios in order
run_scenario "scenario_1_redis.js" "Redis Contention & Basic Routing"
run_scenario "scenario_3_cpu.js" "CPU-Bound Regex & Redaction"
run_scenario "scenario_4_audit.js" "Audit Log Write Saturation"
run_scenario "scenario_5_chaos.js" "Circuit Breaker & Resilience"

echo "============================================================"
echo "🎉 ALL LOAD TESTS COMPLETED SUCCESSFULLY"
echo "============================================================"
