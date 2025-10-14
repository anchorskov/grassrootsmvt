#!/bin/bash

# 🌾 GrassrootsMVT Local Development Testing
# Tests local Wrangler dev environment on ports 8787/8788

set -e

echo "🌾 GrassrootsMVT Local Development Testing"
echo "========================================="
echo ""

# Configuration for local testing
LOCAL_API_PORT="8787"
LOCAL_UI_PORT="8788"
LOCAL_API_URL="http://localhost:$LOCAL_API_PORT"
LOCAL_UI_URL="http://localhost:$LOCAL_UI_PORT"

# Test results tracking
PASSED_TESTS=0
TOTAL_TESTS=0

# Helper functions
log_info() {
    echo "ℹ️  $1"
}

log_success() {
    echo "✅ $1"
    ((PASSED_TESTS++))
}

log_error() {
    echo "❌ $1"
}

increment_test() {
    ((TOTAL_TESTS++))
}

echo "Local API URL: $LOCAL_API_URL"
echo "Local UI URL:  $LOCAL_UI_URL"
echo ""

# Test local API health
log_info "Testing Local API Health..."

increment_test
if curl -sf "$LOCAL_API_URL/api/ping" >/dev/null 2>&1; then
    PING_RESPONSE=$(curl -s "$LOCAL_API_URL/api/ping")
    log_success "API ping responding: $PING_RESPONSE"
else
    log_error "API ping failed - is Wrangler running on port $LOCAL_API_PORT?"
fi

increment_test
HEALTH_RESPONSE=$(curl -s "$LOCAL_API_URL/api/healthz" 2>/dev/null)
if echo "$HEALTH_RESPONSE" | grep -q "healthy\|ok" 2>/dev/null; then
    log_success "API health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    log_error "API health check failed or not available"
fi

echo ""

# Test core API endpoints
log_info "Testing Core API Endpoints..."

increment_test
METADATA_RESPONSE=$(curl -s "$LOCAL_API_URL/api/metadata" 2>/dev/null)
if echo "$METADATA_RESPONSE" | grep -q "counties\|count" 2>/dev/null; then
    log_success "Metadata endpoint responding"
    echo "   Response preview: $(echo "$METADATA_RESPONSE" | head -c 100)..."
else
    log_error "Metadata endpoint failed"
fi

increment_test
VOTERS_RESPONSE=$(curl -s "$LOCAL_API_URL/api/voters?county=NATRONA&limit=3" 2>/dev/null)
if echo "$VOTERS_RESPONSE" | grep -q "voters\|voter_id" 2>/dev/null; then
    log_success "Voters endpoint responding"
    echo "   Response preview: $(echo "$VOTERS_RESPONSE" | head -c 100)..."
else
    log_error "Voters endpoint failed"
fi

increment_test
TEMPLATES_RESPONSE=$(curl -s "$LOCAL_API_URL/api/templates?category=phone" 2>/dev/null)
if echo "$TEMPLATES_RESPONSE" | grep -q "templates\|category" 2>/dev/null; then
    log_success "Templates endpoint responding"
    echo "   Response preview: $(echo "$TEMPLATES_RESPONSE" | head -c 100)..."
else
    log_error "Templates endpoint failed"
fi

echo ""

# Test authentication behavior (should fail without token)
log_info "Testing Authentication Requirements..."

increment_test
CALL_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$LOCAL_API_URL/api/call" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null)
if [[ "$CALL_STATUS" == "401" || "$CALL_STATUS" == "403" ]]; then
    log_success "Call endpoint requires authentication (HTTP $CALL_STATUS)"
elif [[ "$CALL_STATUS" == "400" ]]; then
    log_success "Call endpoint accessible but requires valid data (HTTP $CALL_STATUS)"
else
    log_error "Call endpoint unexpected status: HTTP $CALL_STATUS"
fi

increment_test
CANVASS_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$LOCAL_API_URL/api/canvass" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null)
if [[ "$CANVASS_STATUS" == "401" || "$CANVASS_STATUS" == "403" ]]; then
    log_success "Canvass endpoint requires authentication (HTTP $CANVASS_STATUS)"
elif [[ "$CANVASS_STATUS" == "400" ]]; then
    log_success "Canvass endpoint accessible but requires valid data (HTTP $CANVASS_STATUS)"
else
    log_error "Canvass endpoint unexpected status: HTTP $CANVASS_STATUS"
fi

echo ""

# Test UI accessibility (if running)
log_info "Testing Local UI Accessibility..."

increment_test
UI_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$LOCAL_UI_URL" 2>/dev/null)
if [[ "$UI_STATUS" == "200" ]]; then
    log_success "UI accessible on port $LOCAL_UI_PORT (HTTP $UI_STATUS)"
elif [[ "$UI_STATUS" == "000" ]]; then
    log_error "UI not accessible - is Wrangler running on port $LOCAL_UI_PORT?"
else
    log_error "UI unexpected status: HTTP $UI_STATUS"
fi

echo ""

# Test CORS headers
log_info "Testing CORS Configuration..."

increment_test
CORS_HEADERS=$(curl -sI "$LOCAL_API_URL/api/ping" 2>/dev/null | grep -i "access-control" || echo "None")
if echo "$CORS_HEADERS" | grep -q "access-control-allow-origin" 2>/dev/null; then
    log_success "CORS headers present"
    echo "   Headers: $CORS_HEADERS"
else
    log_error "CORS headers missing - may cause browser issues"
fi

echo ""

# Test database connectivity
log_info "Testing Local Database..."

increment_test
if command -v npx >/dev/null && command -v wrangler >/dev/null; then
    # Test local database
    DB_TEST=$(npx wrangler d1 execute wy --local --command "SELECT COUNT(*) as count FROM voters;" 2>/dev/null)
    if echo "$DB_TEST" | grep -q "[0-9]" 2>/dev/null; then
        VOTER_COUNT=$(echo "$DB_TEST" | grep -o '[0-9]\+' | tail -1)
        log_success "Local database accessible with $VOTER_COUNT voters"
    else
        log_error "Local database query failed"
    fi
else
    log_error "Wrangler CLI not available for database testing"
fi

echo ""

# Performance testing
log_info "Testing API Performance..."

increment_test
START_TIME=$(date +%s%N)
curl -s "$LOCAL_API_URL/api/voters?county=NATRONA&limit=25" >/dev/null 2>&1
END_TIME=$(date +%s%N)
RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 )) # Convert to milliseconds

if [[ "$RESPONSE_TIME" -lt 100 ]]; then
    log_success "API response time excellent (${RESPONSE_TIME}ms)"
elif [[ "$RESPONSE_TIME" -lt 500 ]]; then
    log_success "API response time good (${RESPONSE_TIME}ms)"
else
    log_error "API response time slow (${RESPONSE_TIME}ms)"
fi

echo ""

# Summary
echo "📊 Local Development Summary"
echo "============================"
echo "Tests passed: $PASSED_TESTS/$TOTAL_TESTS"
echo ""

if [[ "$PASSED_TESTS" -eq "$TOTAL_TESTS" ]]; then
    echo "✅ All local tests passed!"
    echo ""
    echo "🎯 Next Steps:"
    echo "• Test volunteer UI workflows manually"
    echo "• Check browser console for any JS errors"
    echo "• Test API integration in the volunteer pages"
    echo ""
    echo "🔗 Local URLs:"
    echo "• API: $LOCAL_API_URL"
    echo "• UI: $LOCAL_UI_URL"
    echo "• Volunteer Portal: $LOCAL_UI_URL/volunteer/"
else
    echo "⚠️  Some tests failed - check Wrangler processes"
    echo ""
    echo "💡 Troubleshooting:"
    echo "• Ensure 'wrangler dev' is running on port $LOCAL_API_PORT"
    echo "• Ensure UI server is running on port $LOCAL_UI_PORT"
    echo "• Check for any error messages in Wrangler output"
fi

echo ""
echo "🔧 Development Commands:"
echo "# API Server:"
echo "cd worker && wrangler dev --port $LOCAL_API_PORT"
echo ""
echo "# UI Server (if separate):"
echo "cd ui && python -m http.server $LOCAL_UI_PORT"
echo "# or:"
echo "cd ui && npx serve -p $LOCAL_UI_PORT"
