#!/bin/bash
set -e

echo "Starting Redis..."
/usr/bin/redis-server --daemonize yes

echo "Starting PostgreSQL..."
# In Debian, postgresql init.d script requires running as root to start the service
/etc/init.d/postgresql start

echo "Waiting for PostgreSQL to be ready..."
until su - postgres -c "pg_isready" >/dev/null 2>&1; do
    sleep 1
done

echo "Starting AILink Gateway (Backend)..."
# Start the rust gateway in the background
cd /app/gateway
# Wait for 1 second just to be sure postgres is fully accepting connections
sleep 1
./ailink serve &
GATEWAY_PID=$!

echo "Starting AILink Dashboard (Frontend)..."
# Start Next.js standalone server in foreground
cd /app/dashboard
# Standalone server requires setting correct PORT
export PORT=3000
exec node server.js &
DASHBOARD_PID=$!

echo ""
echo "=========================================================="
echo "    AILink All-in-One Container is Running!               "
echo "                                                          "
echo "    Dashboard : http://localhost:3000                     "
echo "    Gateway   : http://localhost:8443                     "
echo "    Admin Key : ailink-admin-test (default)               "
echo "=========================================================="
echo ""

# Wait for any process to exit
wait -n
  
# Exit with status of process that exited first
exit $?
