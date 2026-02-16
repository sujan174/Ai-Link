# Build Stage
FROM rust:latest AS builder

WORKDIR /usr/src/ailink

# Install build dependencies first (cached layer)
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Cache dependencies: copy manifests, build a dummy, then replace with real source
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release --bin ailink 2>/dev/null || true
RUN rm -rf src

# Now copy real source and rebuild (only app crate recompiles)
COPY . .
RUN touch src/main.rs && cargo build --release --bin ailink

# Runtime Stage
FROM debian:bookworm-slim

# Install runtime dependencies (ca-certificates for HTTPS, libssl for reqwest)
RUN apt-get update && apt-get install -y ca-certificates libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /usr/src/ailink/target/release/ailink /app/ailink

# Create non-root user
RUN useradd -m ailink
USER ailink

# Expose port
EXPOSE 8443

# Security: Disable core dumps to prevent key leakage on crash
# The RLIMIT is inherited by the process, preventing memory dumps
ENV MALLOC_TRIM_THRESHOLD_=0

# Set entrypoint with core dumps disabled
CMD ["sh", "-c", "ulimit -c 0 && exec ./ailink serve"]
