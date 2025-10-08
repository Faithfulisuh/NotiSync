#!/bin/bash

# NotiSync Test Environment Setup and Runner

set -e

echo "🚀 Setting up NotiSync Test Environment"
echo "======================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start test databases
echo "📦 Starting test databases..."
docker-compose -f docker-compose.test.yml up -d

# Wait for databases to be ready
echo "⏳ Waiting for databases to be ready..."
sleep 10

# Check if PostgreSQL is ready
echo "🔍 Checking PostgreSQL connection..."
until docker-compose -f docker-compose.test.yml exec -T postgres pg_isready -U notisync -d notisync_test; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Check if Redis is ready
echo "🔍 Checking Redis connection..."
until docker-compose -f docker-compose.test.yml exec -T redis redis-cli ping; do
    echo "Waiting for Redis..."
    sleep 2
done

echo "✅ Databases are ready!"

# Run database migrations (if you have them)
echo "🗄️  Running database migrations..."
# cd ../cmd/migrate && go run main.go -config ../../test-environment/config.test.yaml

# Start the ML classification service
echo "🤖 Starting ML Classification Service..."
cd ../../ml
python main.py &
ML_PID=$!
sleep 5

# Start the NotiSync API server
echo "🌐 Starting NotiSync API Server..."
cd ../services/notisync
CONFIG_PATH=./test-environment/config.test.yaml go run cmd/server/main.go &
API_PID=$!
sleep 5

# Wait for API to be ready
echo "⏳ Waiting for API server to be ready..."
until curl -s http://localhost:8080/health > /dev/null; do
    echo "Waiting for API server..."
    sleep 2
done

echo "✅ API server is ready!"

# Run the API tests
echo "🧪 Running API Tests..."
cd test-environment
chmod +x test-api.sh
./test-api.sh

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up..."
    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
    fi
    if [ ! -z "$ML_PID" ]; then
        kill $ML_PID 2>/dev/null || true
    fi
    docker-compose -f docker-compose.test.yml down
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Keep the services running for manual testing
echo ""
echo "🎉 Test environment is running!"
echo "================================"
echo "API Server: http://localhost:8080"
echo "Health Check: http://localhost:8080/health"
echo "API Documentation: http://localhost:8080/api/v1/info"
echo ""
echo "Press Ctrl+C to stop all services and cleanup"
echo ""

# Wait for user to stop
wait