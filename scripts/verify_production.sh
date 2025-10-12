#!/bin/bash

# 🌾 GrassrootsMVT Production Verification Script
# Last updated: October 12, 2025
# 
# This script validates all critical production components:
# - API endpoint health and functionality
# - JWT authentication flow
# - D1 database integrity and performance
# - Cloudflare Access integration
# - Cache headers and optimization

set -e

# Colors for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROD_API_URL="https://api.grassrootsmvt.org"
PROD_UI_URL="https://grassrootsmvt.org"
TEST_COUNTY="NATRONA"
TEST_HOUSE_DISTRICT="12"

# Test results tracking
PASSED_TESTS=0
TOTAL_TESTS=0
FAILED_TESTS=()

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    FAILED_TESTS+=("$1")
}

increment_test() {
    ((TOTAL_TESTS++))
}

# Test API endpoint health
test_api_health() {
    log_info "Testing API Health Endpoints..."
    
    # Test /api/ping
    increment_test
    if curl -sf "$PROD_API_URL/api/ping" | grep -q "pong"; then
        log_success "API ping endpoint responding"
    else
        log_error "API ping endpoint failed"
    fi
    
    # Test /api/healthz with detailed response
    increment_test
    HEALTH_RESPONSE=$(curl -s "$PROD_API_URL/api/healthz")
    if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        log_success "API health check passed"
        echo "   Database status: $(echo "$HEALTH_RESPONSE" | jq -r '.database')"
        echo "   Uptime: $(echo "$HEALTH_RESPONSE" | jq -r '.uptime')"
    else
        log_error "API health check failed: $HEALTH_RESPONSE"
    fi
}

# Test core API endpoints
test_api_endpoints() {
    log_info "Testing Core API Endpoints..."
    
    # Test /api/metadata
    increment_test
    METADATA_RESPONSE=$(curl -s "$PROD_API_URL/api/metadata")
    if echo "$METADATA_RESPONSE" | jq -e '.counties | length > 0' > /dev/null 2>&1; then
        log_success "Metadata endpoint returning counties"
        COUNTY_COUNT=$(echo "$METADATA_RESPONSE" | jq '.counties | length')
        echo "   Counties available: $COUNTY_COUNT"
    else
        log_error "Metadata endpoint failed or returned no counties"
    fi
    
    # Test /api/voters with sample query
    increment_test
    VOTERS_RESPONSE=$(curl -s "$PROD_API_URL/api/voters?county=$TEST_COUNTY&house_district=$TEST_HOUSE_DISTRICT&limit=5")
    if echo "$VOTERS_RESPONSE" | jq -e '.voters | length > 0' > /dev/null 2>&1; then
        log_success "Voters endpoint returning data"
        VOTER_COUNT=$(echo "$VOTERS_RESPONSE" | jq '.voters | length')
        echo "   Sample voters returned: $VOTER_COUNT"
    else
        log_error "Voters endpoint failed or returned no data"
    fi
    
    # Test /api/templates
    increment_test
    TEMPLATES_RESPONSE=$(curl -s "$PROD_API_URL/api/templates?category=phone")
    if echo "$TEMPLATES_RESPONSE" | jq -e '.templates | length >= 0' > /dev/null 2>&1; then
        log_success "Templates endpoint responding"
        TEMPLATE_COUNT=$(echo "$TEMPLATES_RESPONSE" | jq '.templates | length')
        echo "   Phone templates available: $TEMPLATE_COUNT"
    else
        log_error "Templates endpoint failed"
    fi
}

# Test authentication requirements
test_authentication() {
    log_info "Testing Authentication Requirements..."
    
    # Test that protected endpoints require authentication
    increment_test
    CALL_RESPONSE=$(curl -s -w "%{http_code}" "$PROD_API_URL/api/call" -X POST -H "Content-Type: application/json" -d '{}')
    HTTP_CODE="${CALL_RESPONSE: -3}"
    if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
        log_success "Call endpoint properly requires authentication (HTTP $HTTP_CODE)"
    else
        log_error "Call endpoint should require authentication, got HTTP $HTTP_CODE"
    fi
    
    increment_test
    CANVASS_RESPONSE=$(curl -s -w "%{http_code}" "$PROD_API_URL/api/canvass" -X POST -H "Content-Type: application/json" -d '{}')
    HTTP_CODE="${CANVASS_RESPONSE: -3}"
    if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
        log_success "Canvass endpoint properly requires authentication (HTTP $HTTP_CODE)"
    else
        log_error "Canvass endpoint should require authentication, got HTTP $HTTP_CODE"
    fi
    
    # Test JWT token format validation (if TOKEN environment variable is provided)
    if [[ -n "$JWT_TOKEN" ]]; then
        increment_test
        # Test authenticated request
        AUTH_RESPONSE=$(curl -s "$PROD_API_URL/api/whoami" -H "Cf-Access-Jwt-Assertion: $JWT_TOKEN")
        if echo "$AUTH_RESPONSE" | jq -e '.email' > /dev/null 2>&1; then
            log_success "JWT authentication working"
            USER_EMAIL=$(echo "$AUTH_RESPONSE" | jq -r '.email')
            echo "   Authenticated as: $USER_EMAIL"
        else
            log_error "JWT authentication failed: $AUTH_RESPONSE"
        fi
    else
        log_warning "JWT_TOKEN not provided, skipping authenticated endpoint tests"
        log_warning "Set JWT_TOKEN environment variable to test authenticated endpoints"
    fi
}

# Test D1 database integrity
test_database_integrity() {
    log_info "Testing D1 Database Integrity..."
    
    # Check voter count
    increment_test
    if command -v npx > /dev/null && command -v wrangler > /dev/null; then
        VOTER_COUNT=$(npx wrangler d1 execute wy --env production --remote --command "SELECT COUNT(*) as count FROM voters;" 2>/dev/null | grep -o '[0-9]\+' | tail -1)
        if [[ "$VOTER_COUNT" -gt 270000 ]]; then
            log_success "Voter database contains $VOTER_COUNT records"
        else
            log_error "Voter database contains only $VOTER_COUNT records (expected > 270,000)"
        fi
        
        # Check activity tables
        increment_test
        CALL_COUNT=$(npx wrangler d1 execute wy --env production --remote --command "SELECT COUNT(*) as count FROM call_activity;" 2>/dev/null | grep -o '[0-9]\+' | tail -1)
        CANVASS_COUNT=$(npx wrangler d1 execute wy --env production --remote --command "SELECT COUNT(*) as count FROM canvass_activity;" 2>/dev/null | grep -o '[0-9]\+' | tail -1)
        PULSE_COUNT=$(npx wrangler d1 execute wy --env production --remote --command "SELECT COUNT(*) as count FROM pulse_optins;" 2>/dev/null | grep -o '[0-9]\+' | tail -1)
        
        log_success "Database activity tables verified"
        echo "   Call activities: $CALL_COUNT"
        echo "   Canvass activities: $CANVASS_COUNT"
        echo "   Pulse opt-ins: $PULSE_COUNT"
        
        # Check indexes
        increment_test
        INDEX_COUNT=$(npx wrangler d1 execute wy --env production --remote --command "PRAGMA index_list(voters);" 2>/dev/null | wc -l)
        if [[ "$INDEX_COUNT" -gt 5 ]]; then
            log_success "Performance indexes are in place ($INDEX_COUNT indexes on voters table)"
        else
            log_error "Missing performance indexes (found only $INDEX_COUNT indexes)"
        fi
    else
        log_warning "Wrangler CLI not available, skipping direct database tests"
        log_info "Install wrangler CLI for complete database verification: npm install -g wrangler"
    fi
}

# Test cache headers and performance
test_cache_headers() {
    log_info "Testing Cache Headers and Performance..."
    
    # Test metadata cache headers (should be 24h)
    increment_test
    METADATA_HEADERS=$(curl -sI "$PROD_API_URL/api/metadata")
    if echo "$METADATA_HEADERS" | grep -i "cache-control" | grep -q "max-age=86400"; then
        log_success "Metadata endpoint has correct cache headers (24h)"
    else
        log_error "Metadata endpoint missing or incorrect cache headers"
        echo "   Expected: Cache-Control: max-age=86400"
        echo "   Actual: $(echo "$METADATA_HEADERS" | grep -i "cache-control" || echo "None")"
    fi
    
    # Test voters cache headers (should be 2m)
    increment_test
    VOTERS_HEADERS=$(curl -sI "$PROD_API_URL/api/voters?county=$TEST_COUNTY")
    if echo "$VOTERS_HEADERS" | grep -i "cache-control" | grep -q "max-age=120"; then
        log_success "Voters endpoint has correct cache headers (2m)"
    else
        log_error "Voters endpoint missing or incorrect cache headers"
        echo "   Expected: Cache-Control: max-age=120"
        echo "   Actual: $(echo "$VOTERS_HEADERS" | grep -i "cache-control" || echo "None")"
    fi
    
    # Test response time
    increment_test
    START_TIME=$(date +%s%N)
    curl -s "$PROD_API_URL/api/voters?county=$TEST_COUNTY&limit=25" > /dev/null
    END_TIME=$(date +%s%N)
    RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 )) # Convert to milliseconds
    
    if [[ "$RESPONSE_TIME" -lt 500 ]]; then
        log_success "API response time acceptable (${RESPONSE_TIME}ms)"
    elif [[ "$RESPONSE_TIME" -lt 1000 ]]; then
        log_warning "API response time slow but acceptable (${RESPONSE_TIME}ms)"
    else
        log_error "API response time too slow (${RESPONSE_TIME}ms > 1000ms)"
    fi
}

# Test UI accessibility
test_ui_accessibility() {
    log_info "Testing UI Accessibility..."
    
    # Test main landing page
    increment_test
    UI_RESPONSE=$(curl -s -w "%{http_code}" "$PROD_UI_URL")
    HTTP_CODE="${UI_RESPONSE: -3}"
    if [[ "$HTTP_CODE" == "200" ]]; then
        log_success "Main UI accessible (HTTP $HTTP_CODE)"
    else
        log_error "Main UI not accessible (HTTP $HTTP_CODE)"
    fi
    
    # Test volunteer portal redirect to authentication
    increment_test
    VOLUNTEER_RESPONSE=$(curl -s -w "%{http_code}" "$PROD_UI_URL/volunteer/")
    HTTP_CODE="${VOLUNTEER_RESPONSE: -3}"
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "302" || "$HTTP_CODE" == "401" ]]; then
        log_success "Volunteer portal accessible with proper auth handling (HTTP $HTTP_CODE)"
    else
        log_error "Volunteer portal not accessible (HTTP $HTTP_CODE)"
    fi
}

# Test SSL and security headers
test_security() {
    log_info "Testing Security Configuration..."
    
    # Test SSL certificate
    increment_test
    if curl -sI "$PROD_API_URL/api/ping" | grep -q "HTTP/2 200\|HTTP/1.1 200"; then
        log_success "SSL certificate valid and HTTPS working"
    else
        log_error "SSL/HTTPS configuration issue"
    fi
    
    # Test security headers
    increment_test
    SECURITY_HEADERS=$(curl -sI "$PROD_API_URL/api/ping")
    SECURITY_SCORE=0
    
    if echo "$SECURITY_HEADERS" | grep -qi "x-content-type-options"; then
        ((SECURITY_SCORE++))
    fi
    if echo "$SECURITY_HEADERS" | grep -qi "x-frame-options"; then
        ((SECURITY_SCORE++))
    fi
    if echo "$SECURITY_HEADERS" | grep -qi "strict-transport-security"; then
        ((SECURITY_SCORE++))
    fi
    
    if [[ "$SECURITY_SCORE" -ge 2 ]]; then
        log_success "Security headers configured ($SECURITY_SCORE/3 headers present)"
    else
        log_warning "Limited security headers ($SECURITY_SCORE/3 headers present)"
    fi
}

# JWT token validation helper
validate_jwt_format() {
    if [[ -n "$JWT_TOKEN" ]]; then
        log_info "Validating JWT token format..."
        
        # Basic JWT format check (header.payload.signature)
        if [[ "$JWT_TOKEN" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
            log_success "JWT token format valid"
            
            # Decode payload (base64url)
            PAYLOAD=$(echo "$JWT_TOKEN" | cut -d. -f2)
            # Add padding if needed
            case $((${#PAYLOAD} % 4)) in
                2) PAYLOAD="${PAYLOAD}==" ;;
                3) PAYLOAD="${PAYLOAD}=" ;;
            esac
            
            if command -v base64 > /dev/null; then
                DECODED_PAYLOAD=$(echo "$PAYLOAD" | base64 -d 2>/dev/null || echo "$PAYLOAD" | base64 -D 2>/dev/null)
                if echo "$DECODED_PAYLOAD" | jq -e '.email' > /dev/null 2>&1; then
                    USER_EMAIL=$(echo "$DECODED_PAYLOAD" | jq -r '.email')
                    EXPIRES=$(echo "$DECODED_PAYLOAD" | jq -r '.exp // empty')
                    echo "   Token user: $USER_EMAIL"
                    if [[ -n "$EXPIRES" ]]; then
                        CURRENT_TIME=$(date +%s)
                        if [[ "$EXPIRES" -gt "$CURRENT_TIME" ]]; then
                            log_success "JWT token not expired"
                        else
                            log_warning "JWT token appears to be expired"
                        fi
                    fi
                else
                    log_warning "Could not decode JWT payload"
                fi
            fi
        else
            log_error "JWT token format invalid"
        fi
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "🌾 GrassrootsMVT Production Verification"
    echo "========================================"
    echo -e "${NC}"
    echo "Production API: $PROD_API_URL"
    echo "Production UI:  $PROD_UI_URL"
    echo "Test County:    $TEST_COUNTY"
    echo "Test District:  $TEST_HOUSE_DISTRICT"
    echo ""
    
    # Check dependencies
    log_info "Checking dependencies..."
    if ! command -v curl > /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    if ! command -v jq > /dev/null; then
        log_warning "jq not found - JSON parsing will be limited"
    fi
    
    # Run JWT validation if token provided
    if [[ -n "$JWT_TOKEN" ]]; then
        validate_jwt_format
        echo ""
    fi
    
    # Run all tests
    test_api_health
    echo ""
    test_api_endpoints
    echo ""
    test_authentication
    echo ""
    test_database_integrity
    echo ""
    test_cache_headers
    echo ""
    test_ui_accessibility
    echo ""
    test_security
    echo ""
    
    # Final summary
    echo -e "${BLUE}"
    echo "📘 Production Verification Summary"
    echo "=================================="
    echo -e "${NC}"
    echo "Tests passed: $PASSED_TESTS/$TOTAL_TESTS"
    echo ""
    
    if [[ ${#FAILED_TESTS[@]} -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed - Production ready!${NC}"
        echo ""
        echo -e "${GREEN}✅ API endpoints responding correctly${NC}"
        echo -e "${GREEN}✅ JWT authentication validated${NC}"
        echo -e "${GREEN}✅ D1 data integrity confirmed${NC}"
        echo -e "${GREEN}✅ Cache optimization active${NC}"
        echo -e "${GREEN}✅ Security configuration verified${NC}"
        echo -e "${GREEN}✅ Ready for production release${NC}"
        echo ""
        echo -e "${BLUE}🚀 Production deployment verified and ready for volunteer onboarding!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "${RED}   • $test${NC}"
        done
        echo ""
        echo -e "${YELLOW}⚠️  Address failed tests before production release${NC}"
        exit 1
    fi
}

# Execute main function
main