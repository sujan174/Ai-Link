# Build stage
FROM rust:1.75-slim AS builder
WORKDIR /app

# Cache dependency build
COPY gateway/Cargo.toml gateway/Cargo.lock* ./gateway/
RUN mkdir -p gateway/src && echo "fn main() {}" > gateway/src/main.rs
RUN cd gateway && cargo build --release 2>/dev/null || true

# Build actual source
COPY gateway/ ./gateway/
RUN cd gateway && cargo build --release

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/gateway/target/release/ailink /usr/local/bin/ailink

EXPOSE 8443
ENTRYPOINT ["ailink"]
CMD ["serve"]
