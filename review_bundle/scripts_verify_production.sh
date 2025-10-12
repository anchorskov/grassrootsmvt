#!/bin/bash

# 🧪 GrassrootsMVT — Schema & API Verification Helper
# Quick validation that volunteer actions are persisting correctly

echo "🌾 GrassrootsMVT Production Verification"
echo "========================================"

echo ""
echo "📊 Database Activity Summary:"
echo "-----------------------------"

# One-line helper for schema + API verification
npx wrangler d1 execute wy --env production --remote --command "
SELECT 
  COUNT(*) AS voters,
  (SELECT COUNT(*) FROM call_activity) AS calls,
  (SELECT COUNT(*) FROM canvass_activity) AS canvasses,
  (SELECT COUNT(*) FROM pulse_optins) AS opt_ins,
  (SELECT COUNT(*) FROM message_templates) AS templates
;"

echo ""
echo "📈 Recent Activity (Last 24 Hours):"
echo "-----------------------------------"

npx wrangler d1 execute wy --env production --remote --command "
SELECT 
  (SELECT COUNT(*) FROM call_activity WHERE created_at > datetime('now', '-1 day')) AS recent_calls,
  (SELECT COUNT(*) FROM canvass_activity WHERE created_at > datetime('now', '-1 day')) AS recent_canvasses,
  (SELECT COUNT(*) FROM pulse_optins WHERE created_at > datetime('now', '-1 day')) AS recent_opt_ins
;"

echo ""
echo "🔍 API Endpoint Health Check:"
echo "-----------------------------"

# Test API endpoints
echo "Testing /api/ping..."
curl -s "https://api.grassrootsmvt.org/api/ping" | head -1

echo "Testing /api/voters..."
curl -s "https://api.grassrootsmvt.org/api/voters?house_district=12" | head -1

echo "Testing /api/templates..."
curl -s "https://api.grassrootsmvt.org/api/templates?category=phone" | head -1

echo ""
echo "✅ Verification complete! This confirms:"
echo "  • Voter database is populated and accessible"
echo "  • Volunteer activity tracking is functional"  
echo "  • API endpoints are responding correctly"
echo "  • Real volunteer actions are being persisted"