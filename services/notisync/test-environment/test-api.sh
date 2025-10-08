#!/bin/bash

# NotiSync API Test Script
# This script tests all the backend functionality we've built

BASE_URL="http://localhost:8080"
API_URL="$BASE_URL/api/v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test results
print_test_result() {
    local test_name="$1"
    local status_code="$2"
    local expected_code="$3"
    
    if [ "$status_code" -eq "$expected_code" ]; then
        echo -e "${GREEN}✓ PASS${NC} - $test_name (HTTP $status_code)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} - $test_name (Expected HTTP $expected_code, got $status_code)"
        ((TESTS_FAILED++))
    fi
}

# Function to make API calls
api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local auth_header="$4"
    
    if [ -n "$data" ]; then
        if [ -n "$auth_header" ]; then
            curl -s -w "%{http_code}" -X "$method" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $auth_header" \
                -d "$data" \
                "$API_URL$endpoint"
        else
            curl -s -w "%{http_code}" -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$API_URL$endpoint"
        fi
    else
        if [ -n "$auth_header" ]; then
            curl -s -w "%{http_code}" -X "$method" \
                -H "Authorization: Bearer $auth_header" \
                "$API_URL$endpoint"
        else
            curl -s -w "%{http_code}" -X "$method" \
                "$API_URL$endpoint"
        fi
    fi
}

echo -e "${BLUE}🚀 Starting NotiSync API Tests${NC}"
echo "=================================="

# Test 1: Health Check
echo -e "\n${YELLOW}1. Testing Health Check${NC}"
response=$(curl -s -w "%{http_code}" "$BASE_URL/health")
status_code="${response: -3}"
print_test_result "Health Check" "$status_code" "200"

# Test 2: System Info
echo -e "\n${YELLOW}2. Testing System Info${NC}"
response=$(api_call "GET" "/system")
status_code="${response: -3}"
print_test_result "System Info" "$status_code" "200"

# Test 3: API Info
echo -e "\n${YELLOW}3. Testing API Info${NC}"
response=$(api_call "GET" "/info")
status_code="${response: -3}"
print_test_result "API Info" "$status_code" "200"

# Test 4: User Registration
echo -e "\n${YELLOW}4. Testing User Registration${NC}"
user_data='{
    "email": "test@example.com",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
}'
response=$(api_call "POST" "/auth/register" "$user_data")
status_code="${response: -3}"
print_test_result "User Registration" "$status_code" "201"

# Test 5: User Login
echo -e "\n${YELLOW}5. Testing User Login${NC}"
login_data='{
    "email": "test@example.com",
    "password": "password123"
}'
response=$(api_call "POST" "/auth/login" "$login_data")
status_code="${response: -3}"
response_body="${response%???}"

if [ "$status_code" -eq "200" ]; then
    # Extract JWT token from response
    JWT_TOKEN=$(echo "$response_body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Login successful, JWT token obtained${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Login failed${NC}"
    ((TESTS_FAILED++))
    JWT_TOKEN=""
fi

if [ -n "$JWT_TOKEN" ]; then
    # Test 6: Device Registration
    echo -e "\n${YELLOW}6. Testing Device Registration${NC}"
    device_data='{
        "name": "Test Device",
        "platform": "android",
        "device_token": "test-device-token-123"
    }'
    response=$(api_call "POST" "/auth/devices" "$device_data" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Device Registration" "$status_code" "201"

    # Test 7: Create Notification
    echo -e "\n${YELLOW}7. Testing Notification Creation${NC}"
    notification_data='{
        "app_name": "Slack",
        "title": "Team Meeting",
        "body": "Daily standup in 10 minutes",
        "category": "Work",
        "priority": 2
    }'
    response=$(api_call "POST" "/notifications" "$notification_data" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Notification Creation" "$status_code" "201"

    # Test 8: Get Notifications
    echo -e "\n${YELLOW}8. Testing Get Notifications${NC}"
    response=$(api_call "GET" "/notifications" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Get Notifications" "$status_code" "200"

    # Test 9: Notification History
    echo -e "\n${YELLOW}9. Testing Notification History${NC}"
    response=$(api_call "GET" "/history" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Notification History" "$status_code" "200"

    # Test 10: Search Notifications
    echo -e "\n${YELLOW}10. Testing Search Notifications${NC}"
    response=$(api_call "GET" "/history/search?q=meeting" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Search Notifications" "$status_code" "200"

    # Test 11: History Statistics
    echo -e "\n${YELLOW}11. Testing History Statistics${NC}"
    response=$(api_call "GET" "/history/stats" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "History Statistics" "$status_code" "200"

    # Test 12: Daily Digest
    echo -e "\n${YELLOW}12. Testing Daily Digest${NC}"
    response=$(api_call "GET" "/digest" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Daily Digest" "$status_code" "200"

    # Test 13: Weekly Digests
    echo -e "\n${YELLOW}13. Testing Weekly Digests${NC}"
    response=$(api_call "GET" "/digest/weekly" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Weekly Digests" "$status_code" "200"

    # Test 14: User Profile
    echo -e "\n${YELLOW}14. Testing User Profile${NC}"
    response=$(api_call "GET" "/user/profile" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "User Profile" "$status_code" "200"

    # Test 15: Get Devices
    echo -e "\n${YELLOW}15. Testing Get Devices${NC}"
    response=$(api_call "GET" "/devices" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "Get Devices" "$status_code" "200"

    # Test 16: WebSocket Stats
    echo -e "\n${YELLOW}16. Testing WebSocket Stats${NC}"
    response=$(api_call "GET" "/websocket/stats" "" "$JWT_TOKEN")
    status_code="${response: -3}"
    print_test_result "WebSocket Stats" "$status_code" "200"
fi

# Test 17: Unauthorized Access
echo -e "\n${YELLOW}17. Testing Unauthorized Access${NC}"
response=$(api_call "GET" "/notifications")
status_code="${response: -3}"
print_test_result "Unauthorized Access (should fail)" "$status_code" "401"

# Summary
echo -e "\n${BLUE}=================================="
echo -e "📊 Test Results Summary${NC}"
echo -e "=================================="
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Your NotiSync backend is working correctly.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please check the implementation.${NC}"
    exit 1
fi