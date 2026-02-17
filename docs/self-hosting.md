# Self-Hosting AILink 🚀

Run the full AILink stack (Gateway + Dashboard + Database) on your machine or a server in a few minutes.

## Prerequisites

*   [Docker](https://docs.docker.com/get-docker/) installed and running.
*   `git` (optional, to clone the repo).

## Quick Start

1.  **Clone the repository**
    ```bash
    git clone https://github.com/sujan174/ailink.git
    cd ailink
    ```

2.  **Start the Stack**
    Run the following command to build and start all services:
    ```bash
    docker compose up -d --build
    ```

    *This may take a few minutes the first time as it compiles the Rust Gateway and builds the Next.js Dashboard.*

3.  **Access the Dashboard**
    Open your browser and navigate to:
    👉 **[http://localhost:3000](http://localhost:3000)**

    *   **Default Admin Key**: `ailink-admin-test` (configured in `docker-compose.yml`)

## What's Running?

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | `http://localhost:3000` | Web UI for managing policies, tokens, and logs. |
| **Gateway** | `http://localhost:8443` | The AI Proxy API. Point your LLM clients here. |
| **Postgres** | `localhost:5432` | Database (User: `postgres`, Pass: `password`). |
| **Redis** | `localhost:6379` | Cache and Rate Limiting store. |

## Configuration

You can customize the setup by editing `docker-compose.yml`:

*   **AILink Master Key**: `AILINK_MASTER_KEY` (Change this for production!)
*   **Admin Key**: `AILINK_ADMIN_KEY`
*   **Ports**: Change `8443:8443` or `3000:3000` if you have conflicts.

## Troubleshooting

**"Connection Refused"**
Ensure Docker is running. Check `docker ps` to see if containers are healthy.

**"Gateway container keeps restarting"**
Check logs: `docker logs ailink-gateway-1`. Usually due to database connection issues.

**"Dashboard shows Network Error"**
Ensure the Dashboard can reach the Gateway. The default config uses `http://localhost:8443` for client-side browser calls.
