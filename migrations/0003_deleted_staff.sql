-- Staff accounts removed by an admin. Kept so the activity log can still name who did what.

CREATE TABLE IF NOT EXISTS deleted_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  deleted_by TEXT
);
