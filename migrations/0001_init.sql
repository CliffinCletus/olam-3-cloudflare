-- OLAM 3.0 schema (Cloudflare D1 / SQLite). Timestamps are ISO-8601 UTC strings.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'coordinator', 'scanner')),
  branch_id TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  can_export INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  mobile_key TEXT NOT NULL UNIQUE,      -- last 10 digits: one registration per phone number
  email TEXT NOT NULL UNIQUE,           -- lower-cased: one registration per email
  branch_id TEXT NOT NULL,
  batch TEXT NOT NULL,
  batch_no TEXT,
  faculty_name TEXT,
  privacy_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reg_branch_status ON registrations (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_reg_created ON registrations (created_at);
CREATE INDEX IF NOT EXISTS idx_reg_batch ON registrations (batch);

CREATE TABLE IF NOT EXISTS passes (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,      -- only the HMAC of the derived token is stored
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  issued_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL UNIQUE, -- unique = duplicate-safe check-in
  checked_in_at TEXT NOT NULL,
  scanner_id TEXT,
  scanner_name TEXT,
  station TEXT
);
CREATE INDEX IF NOT EXISTS idx_att_time ON attendance (checked_in_at);

CREATE TABLE IF NOT EXISTS scan_attempts (
  id TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  reference TEXT,
  full_name TEXT,
  batch TEXT,
  branch_id TEXT,
  branch_name TEXT,
  attempted_at TEXT NOT NULL,
  scanner_id TEXT,
  scanner_name TEXT,
  station TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempt_time ON scan_attempts (attempted_at);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  registration_open INTEGER NOT NULL DEFAULT 1,
  closed_message TEXT,
  privacy_notice TEXT,
  event_date TEXT,
  event_time_venue TEXT,
  updated_at TEXT,
  updated_by_name TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  timestamp TEXT NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (timestamp);

-- Sliding-window rate limits and sign-in lockouts.
CREATE TABLE IF NOT EXISTS rate_hits (
  k TEXT NOT NULL,
  t INTEGER NOT NULL                    -- unix ms
);
CREATE INDEX IF NOT EXISTS idx_rate_k_t ON rate_hits (k, t);

-- Seed data (same defaults as the original app)
INSERT OR IGNORE INTO branches (id, name, active, created_at) VALUES
  ('br-1', 'KALOOR', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('br-2', 'ELAMAKKARA', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('br-3', 'MUVATTUPUZHA', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO batches (id, name, sort_order) VALUES
  ('bt-a1', 'A1', 1),
  ('bt-a2', 'A2', 2),
  ('bt-b1', 'B1', 3),
  ('bt-b2', 'B2', 4),
  ('bt-prep', 'Preparation', 5),
  ('bt-passed', 'Passed out', 6);

INSERT OR IGNORE INTO settings (id, registration_open) VALUES ('event', 1);
