-- Super admins open / close gate check-in. Closed by default: scanning is refused until an admin starts check-in.
ALTER TABLE settings ADD COLUMN checkin_open INTEGER NOT NULL DEFAULT 0;
