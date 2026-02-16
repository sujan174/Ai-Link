#!/bin/bash
set -e

# Kill any existing instances
pkill ailink || true

# Set environment variables for local development
export DATABASE_URL="postgres://localhost:5432/ailink"
export RUST_LOG="info,gateway=debug,tower_http=debug"
export PA_MAX_CONNECTIONS=1

# Build and Run
echo "Building..."
cd gateway
cargo build --bin ailink

echo "Starting Gateway..."
./target/debug/ailink
