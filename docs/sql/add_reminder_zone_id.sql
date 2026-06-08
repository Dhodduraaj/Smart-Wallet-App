-- PostgreSQL / Supabase — run manually in SQL editor (do not auto-run from app).
-- Fixes scheduler error: column reminder_zone_id does not exist

ALTER TABLE daily_reminder_configs
    ADD COLUMN IF NOT EXISTS reminder_zone_id VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata';

ALTER TABLE daily_reminder_configs
    ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMP;

COMMENT ON COLUMN daily_reminder_configs.reminder_zone_id IS 'IANA timezone for reminder wall-clock (e.g. Asia/Kolkata)';
