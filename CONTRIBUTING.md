# Contributing to AIlink

Thanks for your interest in contributing.

## Dev Environment

### What You Need

- **Rust**: Latest stable (`rustup update`)
- **Node.js**: v18+ (`nvm install 18`)
- **Python**: 3.9+ (`pyenv install 3.9.18`)
- **Docker**: With Docker Compose

### 1. Clone

```bash
git clone https://github.com/sujan174/ailink.git
cd ailink
```

### 2. Start Postgres + Redis

```bash
docker compose up -d postgres redis
```

### 3. Gateway (Rust)

```bash
cd gateway
cp .env.example .env
cargo run
```

### 4. Dashboard (Next.js)

```bash
cd dashboard
npm install
npm run dev
```

### 5. SDK (Python)

```bash
cd sdk/python
pip install -e ".[dev]"
pytest
```

## Pull Requests

1.  Fork the repo, branch off `main`.
2.  Make sure `cargo test` and `npm run build` pass.
3.  Add tests for new functionality.
4.  Update docs if you change how things work.

## Code Style

-   **Rust**: `cargo fmt` + `cargo clippy`
-   **TypeScript**: `npm run lint`
-   **Python**: PEP 8 (`black` + `ruff`)
