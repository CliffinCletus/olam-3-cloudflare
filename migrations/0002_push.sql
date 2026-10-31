-- Web Push reminders: one row per browser/device that opted in to notifications.
-- registration_id links the device to a student (NULL if they opted in before we knew who they were).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  registration_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_reg ON push_subscriptions (registration_id);
