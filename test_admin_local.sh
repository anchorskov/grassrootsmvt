#!/bin/bash
# Test admin functionality locally
# Run this after starting: npx wrangler dev

echo "🧪 Testing Admin Functionality Locally"
echo "========================================"
echo ""

BASE_URL="http://127.0.0.1:8787"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Prerequisites:${NC}"
echo "1. Start dev server: cd worker && npx wrangler dev"
echo "2. Server should be running on http://127.0.0.1:8787"
echo ""
read -p "Press Enter when dev server is running..."
echo ""

# Test 1: Ping endpoint
echo -e "${YELLOW}Test 1: Ping endpoint${NC}"
echo "curl $BASE_URL/api/ping"
PING_RESPONSE=$(curl -s "$BASE_URL/api/ping")
echo "Response: $PING_RESPONSE"
if [[ $PING_RESPONSE == *"ok"* ]]; then
  echo -e "${GREEN}✅ Ping successful${NC}"
else
  echo -e "${RED}❌ Ping failed${NC}"
fi
echo ""

# Test 2: Regular /whoami (should work - no admin check)
echo -e "${YELLOW}Test 2: Regular /whoami${NC}"
echo "curl $BASE_URL/api/whoami"
WHOAMI_RESPONSE=$(curl -s "$BASE_URL/api/whoami")
echo "Response: $WHOAMI_RESPONSE"
if [[ $WHOAMI_RESPONSE == *"dev@localhost"* ]]; then
  echo -e "${GREEN}✅ Regular whoami successful${NC}"
else
  echo -e "${RED}❌ Regular whoami failed${NC}"
fi
echo ""

# Test 3: Admin whoami (should show isAdmin: true for dev@localhost)
echo -e "${YELLOW}Test 3: Admin whoami (dev@localhost should be admin)${NC}"
echo "curl $BASE_URL/api/admin/whoami"
ADMIN_WHOAMI=$(curl -s "$BASE_URL/api/admin/whoami")
echo "Response: $ADMIN_WHOAMI"
if [[ $ADMIN_WHOAMI == *"\"isAdmin\":true"* ]]; then
  echo -e "${GREEN}✅ Admin whoami successful - user IS admin${NC}"
elif [[ $ADMIN_WHOAMI == *"\"isAdmin\":false"* ]]; then
  echo -e "${RED}❌ Admin whoami returned false - user is NOT admin${NC}"
  echo -e "${RED}   Check ADMIN_EMAILS in wrangler.toml${NC}"
else
  echo -e "${RED}❌ Admin whoami failed or unexpected response${NC}"
fi
echo ""

# Test 4: Admin stats (should work if user is admin)
echo -e "${YELLOW}Test 4: Admin stats (requires admin access)${NC}"
echo "curl $BASE_URL/api/admin/stats"
ADMIN_STATS=$(curl -s "$BASE_URL/api/admin/stats")
echo "Response: $ADMIN_STATS"
if [[ $ADMIN_STATS == *"\"ok\":true"* ]] && [[ $ADMIN_STATS == *"stats"* ]]; then
  echo -e "${GREEN}✅ Admin stats successful${NC}"
elif [[ $ADMIN_STATS == *"Admin access required"* ]] || [[ $ADMIN_STATS == *"403"* ]]; then
  echo -e "${RED}❌ Admin stats denied - user is not admin${NC}"
  echo -e "${RED}   Check ADMIN_EMAILS in wrangler.toml${NC}"
else
  echo -e "${RED}❌ Admin stats failed or unexpected response${NC}"
fi
echo ""

# Test 5: Test with non-admin email (simulate)
echo -e "${YELLOW}Test 5: Simulating non-admin user${NC}"
echo "In local dev, all users are treated as authenticated."
echo "To test non-admin behavior, you would need to:"
echo "1. Deploy to production with ADMIN_EMAILS secret set"
echo "2. Log in with an email NOT in the ADMIN_EMAILS list"
echo "3. Try accessing /api/admin/stats"
echo ""

# Summary
echo "========================================"
echo -e "${BLUE}Local Testing Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. If all tests passed, deploy to production:"
echo "   cd worker && npx wrangler deploy --env production"
echo ""
echo "2. Set production admin emails:"
echo "   npx wrangler secret put ADMIN_EMAILS --env production"
echo "   (Enter: your-admin@example.com,other-admin@example.com)"
echo ""
echo "3. Test in production:"
echo "   curl https://volunteers.grassrootsmvt.org/api/admin/whoami"
echo "   curl https://volunteers.grassrootsmvt.org/api/admin/stats"
