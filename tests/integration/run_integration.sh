#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# AIlink E2E Integration Test Runner
# ─────────────────────────────────────────────────────────────
# Usage:
#   ./tests/run_integration.sh          # full cycle: up → test → down
#   ./tests/run_integration.sh --no-teardown   # leave containers running
#   ./tests/run_integration.sh --skip-build    # skip docker build step
#
# Prerequisites:
#   - Docker & Docker Compose installed
#   - Python 3.9+ with pip
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"
SDK_DIR="$REPO_ROOT/sdk/python"

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8443}"
MAX_RETRIES=30
TEARDOWN=true
SKIP_BUILD=false

# Parse args
for arg in "$@"; do
    case $arg in
        --no-teardown) TEARDOWN=false ;;
        --skip-build)  SKIP_BUILD=true ;;
    esac
done

echo "╔══════════════════════════════════════════════╗"
echo "║   AIlink E2E Integration Test Runner         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Repo root : $REPO_ROOT"
echo "  SDK dir   : $SDK_DIR"
echo "  Gateway   : $GATEWAY_URL"
echo "  Teardown  : $TEARDOWN"
echo ""

# ── Step 1: Start infrastructure ────────────────
echo "🐳 Step 1: Starting docker compose..."
if [ "$SKIP_BUILD" = false ]; then
    docker compose -f "$REPO_ROOT/docker-compose.yml" up -d --build
else
    docker compose -f "$REPO_ROOT/docker-compose.yml" up -d
fi

# ── Step 2: Wait for gateway ────────────────────
echo "⏳ Step 2: Waiting for gateway to be healthy..."
for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf "$GATEWAY_URL/healthz" > /dev/null 2>&1; then
        echo "   ✅ Gateway is up! (attempt $i)"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "   ❌ Gateway failed to start after $MAX_RETRIES attempts"
        echo "   Dumping gateway logs:"
        docker compose -f "$REPO_ROOT/docker-compose.yml" logs gateway --tail=50
        exit 1
    fi
    printf "   Attempt %d/%d...\r" "$i" "$MAX_RETRIES"
    sleep 2
done

# ── Step 3: Install Python deps ─────────────────
echo "📦 Step 3: Checking Python dependencies..."
cd "$SDK_DIR"
pip3 install -q httpx pydantic pytest pytest-anyio requests 2>/dev/null || true

# ── Step 4: Run tests ───────────────────────────
echo ""
echo "🧪 Step 4: Running integration tests..."
echo "─────────────────────────────────────────"
python3 -m pytest tests/test_integration.py -v --tb=short
TEST_EXIT=$?
echo "─────────────────────────────────────────"

# ── Step 5: Teardown ────────────────────────────
if [ "$TEARDOWN" = true ]; then
    echo "🧹 Step 5: Tearing down docker compose..."
    docker compose -f "$REPO_ROOT/docker-compose.yml" down -v
else
    echo "⏭️  Step 5: Skipping teardown (--no-teardown)"
fi

# ── Result ──────────────────────────────────────
echo ""
if [ $TEST_EXIT -eq 0 ]; then
    echo "✅ All integration tests PASSED!"
else
    echo "❌ Some tests FAILED (exit code: $TEST_EXIT)"
fi

exit $TEST_EXIT
