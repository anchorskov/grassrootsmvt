#!/bin/bash

# GrassrootsMVT Comprehensive Test Suite
# Run this script to thoroughly test your local development environment

set -e

echo "🧪 GRASSROOTSMVT COMPREHENSIVE TEST SUITE"
echo "=========================================="
echo "Testing both Worker API (8787) and Pages UI (8788)"
echo "Environment: LOCAL DEVELOPMENT"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Helper functions
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_pattern="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "$(printf '%2d' $TOTAL_TESTS). $test_name: "
    
    if result=$(eval "$test_command" 2>/dev/null); then
        if [[ -z "$expected_pattern" ]] || echo "$result" | grep -q "$expected_pattern"; then
            echo -e "${GREEN}✅ PASS${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}❌ FAIL${NC} (Pattern not found: $expected_pattern)"
            echo "   Got: $result"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (Command failed)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

run_test_with_status() {
    local test_name="$1"
    local test_command="$2"
    local expected_status="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "$(printf '%2d' $TOTAL_TESTS). $test_name: "
    
    if result=$(eval "$test_command" 2>/dev/null); then
        status=$(echo "$result" | head -1 | grep -o '[0-9]\{3\}')
        if [[ "$status" == "$expected_status" ]]; then
            echo -e "${GREEN}✅ PASS${NC} (HTTP $status)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}❌ FAIL${NC} (Expected HTTP $expected_status, got $status)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (Request failed)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo -e "${BLUE}📡 PHASE 1: BASIC CONNECTIVITY${NC}"
echo "============================================"

run_test "Worker API Health Check" \
    "curl -s http://localhost:8787/api/ping" \
    "\"ok\":true"

run_test "Pages UI Accessibility" \
    "curl -s -I http://localhost:8788" \
    "200 OK"

run_test "Worker Environment Detection" \
    "curl -s http://localhost:8787/auth/config" \
    "\"environment\":\"local\""

run_test "Authentication Bypass Enabled" \
    "curl -s http://localhost:8787/auth/config" \
    "\"authRequired\":false"

echo ""
echo -e "${BLUE}🔐 PHASE 2: AUTHENTICATION & AUTHORIZATION${NC}"
echo "============================================"

run_test "Auth Config Endpoint" \
    "curl -s http://localhost:8787/auth/config | jq -r '.environment'" \
    "local"

run_test "Who Am I (No Auth Required)" \
    "curl -s http://localhost:8787/api/whoami" \
    "\"email\":\"dev@localhost\""

run_test "Mock User Details" \
    "curl -s http://localhost:8787/api/whoami" \
    "\"source\":\"Local Development\""

echo ""
echo -e "${BLUE}🗄️ PHASE 3: DATABASE & API ENDPOINTS${NC}"
echo "============================================"

run_test "Database Tables List" \
    "curl -s http://localhost:8787/api/db/tables" \
    "\"ok\":true"

run_test "Voters API Endpoint" \
    "curl -s 'http://localhost:8787/api/voters?limit=5'" \
    "\"ok\":true"

run_test "Metadata API (Counties)" \
    "curl -s http://localhost:8787/api/metadata" \
    "\"ok\":true"

run_test "Message Templates API" \
    "curl -s http://localhost:8787/api/templates" \
    "\"ok\":true"

echo ""
echo -e "${BLUE}🌐 PHASE 4: CORS & CROSS-ORIGIN${NC}"
echo "============================================"

run_test "CORS Preflight (OPTIONS)" \
    "curl -s -X OPTIONS -H 'Origin: http://localhost:8788' -I http://localhost:8787/auth/config" \
    "Access-Control-Allow-Origin"

run_test "CORS Actual Request" \
    "curl -s -H 'Origin: http://localhost:8788' http://localhost:8787/api/ping" \
    "\"ok\":true"

echo ""
echo -e "${BLUE}📝 PHASE 5: DATA OPERATIONS${NC}"
echo "============================================"

# Test POST endpoints that should work without authentication
run_test "Error Logging Endpoint" \
    "curl -s -X POST -H 'Content-Type: application/json' -d '{\"sessionId\":\"test\",\"logs\":[{\"message\":\"test log\"}]}' http://localhost:8787/api/error-log" \
    "\"ok\":true"

# Test authenticated endpoints (should work with mock user)
run_test "Call Activity Logging" \
    "curl -s -X POST -H 'Content-Type: application/json' -d '{\"voter_id\":\"test123\",\"call_result\":\"contacted\",\"notes\":\"test call\"}' http://localhost:8787/api/call" \
    "\"ok\":true"

run_test "Activity Retrieval" \
    "curl -s http://localhost:8787/api/activity" \
    "\"ok\":true"

echo ""
echo -e "${BLUE}🎨 PHASE 6: UI FRONTEND TESTS${NC}"
echo "============================================"

run_test "Home Page Content" \
    "curl -s http://localhost:8788" \
    "Volunteer Hub"

run_test "Environment Config Import" \
    "curl -s http://localhost:8788" \
    "environmentConfig"

run_test "JavaScript Module Loading" \
    "curl -s http://localhost:8788" \
    "type=\"module\""

# Check if environment config file exists
run_test "Environment Config File" \
    "curl -s http://localhost:8788/config/environments.js" \
    "EnvironmentConfig"

echo ""
echo -e "${BLUE}⚡ PHASE 7: ENVIRONMENT INTEGRATION${NC}"
echo "============================================"

# Test that UI can communicate with API
run_test "Cross-Service API Call" \
    "curl -s -H 'Origin: http://localhost:8788' http://localhost:8787/api/whoami" \
    "dev@localhost"

run_test "Local Development Detection" \
    "curl -s http://localhost:8787/api/ping" \
    "\"environment\":\"local\""

run_test "Auth Bypass Verification" \
    "curl -s http://localhost:8787/api/whoami | jq -r '.source'" \
    "Local Development"

echo ""
echo -e "${BLUE}🔧 PHASE 8: ADVANCED FUNCTIONALITY${NC}"
echo "============================================"

# Test filtering and query parameters
run_test "Voters with City Filter" \
    "curl -s 'http://localhost:8787/api/voters?city=ALBANY&limit=3'" \
    "\"filters_applied\""

run_test "Metadata with District Query" \
    "curl -s 'http://localhost:8787/api/metadata?house_district=01'" \
    "\"mode\":\"district_to_city\""

run_test "Database Schema Check" \
    "curl -s 'http://localhost:8787/api/db/schema?table=voters'" \
    "\"table\":\"voters\""

echo ""
echo -e "${BLUE}🚨 PHASE 9: ERROR HANDLING${NC}"
echo "============================================"

run_test_with_status "404 for Invalid Endpoint" \
    "curl -s -I http://localhost:8787/api/nonexistent" \
    "404"

run_test "Invalid JSON Handling" \
    "curl -s -X POST -H 'Content-Type: application/json' -d 'invalid-json' http://localhost:8787/api/error-log" \
    "\"ok\":false"

run_test "Missing Parameters" \
    "curl -s -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:8787/api/call" \
    "\"ok\":false"

echo ""
echo -e "${BLUE}🏁 PHASE 10: PERFORMANCE & EDGE CASES${NC}"
echo "============================================"

run_test "Large Result Set Limit" \
    "curl -s 'http://localhost:8787/api/voters?limit=25'" \
    "\"total\""

run_test "Empty Query Handling" \
    "curl -s 'http://localhost:8787/api/voters'" \
    "\"ok\":true"

run_test "Special Characters in Notes" \
    "curl -s -X POST -H 'Content-Type: application/json' -d '{\"voter_id\":\"test\",\"call_result\":\"contacted\",\"notes\":\"Test with émojis 🎉 & symbols @#$\"}' http://localhost:8787/api/call" \
    "\"ok\":true"

# Final Results
echo ""
echo "============================================"
echo -e "${BLUE}📊 TEST RESULTS SUMMARY${NC}"
echo "============================================"
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL TESTS PASSED! 🎉${NC}"
    echo "Your GrassrootsMVT local development environment is working perfectly!"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "• Open http://localhost:8788 in your browser"
    echo "• Test the UI manually by selecting counties/districts"
    echo "• Try the authentication bypass features"
    echo "• Ready for development work!"
else
    echo ""
    echo -e "${RED}⚠️ SOME TESTS FAILED ⚠️${NC}"
    echo "Please check the failed tests above and fix any issues."
    echo ""
    echo -e "${YELLOW}Debug Steps:${NC}"
    echo "• Check terminal logs for both Worker and Pages"
    echo "• Verify both services are running on correct ports"
    echo "• Check network connectivity between services"
fi

echo ""
echo -e "${BLUE}🔗 Service URLs:${NC}"
echo "• Worker API: http://localhost:8787"
echo "• Pages UI: http://localhost:8788"
echo "• API Docs: http://localhost:8787/api/ping"
echo "• Environment Config: http://localhost:8787/auth/config"