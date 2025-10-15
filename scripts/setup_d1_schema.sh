#!/usr/bin/env bash
# setup_d1_schema.sh - Ensure all required tables exist in D1 with proper schema
# Creates operational tables needed for contact tracking and volunteer management

set -euo pipefail

LOCAL_DB="wy_preview"
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"

# Color codes
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info(){ echo -e "${BLUE}🔍${NC} $1"; }
success(){ echo -e "${GREEN}✅${NC} $1"; }
warning(){ echo -e "${YELLOW}⚠️${NC} $1"; }
error(){ echo -e "${RED}❌${NC} $1" >&2; }

# Function to execute D1 command
d1_exec() {
  cd "$WORKER_DIR"
  npx wrangler d1 execute "$LOCAL_DB" --command "$1" --local
}

info "Setting up complete D1 database schema for GrassrootsMVT"

# Create voter_contacts table for rich contact tracking
info "Creating voter_contacts table..."
d1_exec "
  CREATE TABLE IF NOT EXISTS voter_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id TEXT NOT NULL,
    volunteer_id TEXT,
    method TEXT DEFAULT 'door',
    outcome TEXT,
    contact_date DATE DEFAULT (date('now')),
    wants_volunteer INTEGER DEFAULT 0,
    wants_updates INTEGER DEFAULT 0,
    ok_callback INTEGER DEFAULT 0,
    requested_info INTEGER DEFAULT 0,
    email TEXT,
    optin_email INTEGER DEFAULT 0,
    optin_sms INTEGER DEFAULT 0,
    for_term_limits INTEGER DEFAULT 0,
    issue_public_lands INTEGER DEFAULT 0,
    dnc INTEGER DEFAULT 0,
    comments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
  );
"

d1_exec "CREATE INDEX IF NOT EXISTS idx_voter_contacts_voter_id ON voter_contacts(voter_id);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_voter_contacts_volunteer ON voter_contacts(volunteer_id);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_voter_contacts_date ON voter_contacts(created_at);"

# Create canvass_activity table for basic contact logging
info "Creating canvass_activity table..."
d1_exec "
  CREATE TABLE IF NOT EXISTS canvass_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id TEXT NOT NULL,
    volunteer_email TEXT,
    result TEXT,
    notes TEXT,
    pulse_opt_in INTEGER DEFAULT 0,
    pitch_used TEXT,
    location_lat REAL,
    location_lng REAL,
    door_status TEXT,
    followup_needed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
  );
"

d1_exec "CREATE INDEX IF NOT EXISTS idx_canvass_voter_id ON canvass_activity(voter_id);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_canvass_volunteer ON canvass_activity(volunteer_email);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_canvass_created ON canvass_activity(created_at);"

# Create call_activity table for phone banking
info "Creating call_activity table..."
d1_exec "
  CREATE TABLE IF NOT EXISTS call_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    voter_id TEXT NOT NULL,
    volunteer_email TEXT,
    outcome TEXT,
    payload_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
  );
"

d1_exec "CREATE INDEX IF NOT EXISTS idx_call_voter_id ON call_activity(voter_id);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_call_volunteer ON call_activity(volunteer_email);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_call_ts ON call_activity(ts);"

# Create volunteers table for authentication
info "Creating volunteers table..."
d1_exec "
  CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'active',
    role TEXT DEFAULT 'volunteer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );
"

d1_exec "CREATE INDEX IF NOT EXISTS idx_volunteers_name ON volunteers(name);"

# Create pulse_optins table for communication consent
info "Creating pulse_optins table..."
d1_exec "
  CREATE TABLE IF NOT EXISTS pulse_optins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id TEXT NOT NULL,
    contact_method TEXT NOT NULL,
    consent_given INTEGER DEFAULT 1,
    consent_source TEXT,
    volunteer_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
  );
"

d1_exec "CREATE INDEX IF NOT EXISTS idx_pulse_voter_id ON pulse_optins(voter_id);"
d1_exec "CREATE INDEX IF NOT EXISTS idx_pulse_method ON pulse_optins(contact_method);"

# Create message_templates table for canvass scripts
info "Creating message_templates table..."
d1_exec "
  CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT UNIQUE NOT NULL,
    template_text TEXT NOT NULL,
    category TEXT DEFAULT 'canvass',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
"

# Insert default message templates
d1_exec "
  INSERT OR IGNORE INTO message_templates (template_name, template_text, category) VALUES
  ('General Introduction', 'Hi, I''m volunteering with GrassrootsMVT. We''re working to connect with voters in your area about important local issues.', 'canvass'),
  ('Term Limits Support', 'We''re advocating for term limits to bring fresh perspectives to government. Would you be interested in learning more?', 'issue'),
  ('Public Lands', 'We''re working to protect Wyoming''s public lands for future generations. Is this something you care about?', 'issue');
"

# Verify schema
info "Verifying database schema..."
cd "$WORKER_DIR"

echo "📊 Database Tables:"
npx wrangler d1 execute "$LOCAL_DB" --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --local

echo
echo "📈 Table Counts:"
for table in voters v_voters_addr_norm v_best_phone voter_contacts canvass_activity call_activity volunteers pulse_optins message_templates; do
  count=$(npx wrangler d1 execute "$LOCAL_DB" --command "SELECT COUNT(*) FROM $table;" --local 2>/dev/null | grep -o '[0-9]\+' | tail -1 || echo "0")
  echo "   $table: $count"
done

success "D1 database schema setup complete!"

echo
echo "📋 Schema includes:"
echo "✅ voters - Core voter registration data"
echo "✅ v_voters_addr_norm - Normalized addresses"
echo "✅ v_best_phone - Phone numbers with confidence scores"
echo "✅ voter_contacts - Rich contact data with preferences"
echo "✅ canvass_activity - Basic door-to-door logging"
echo "✅ call_activity - Phone banking results"
echo "✅ volunteers - User authentication"
echo "✅ pulse_optins - Communication consent tracking"
echo "✅ message_templates - Canvass scripts"

echo
echo "🚀 Ready for voter data migration!"
echo "Run: ./migrate_voter_data.sh"