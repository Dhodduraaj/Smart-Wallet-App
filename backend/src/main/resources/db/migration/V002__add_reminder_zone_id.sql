-- Run manually on PostgreSQL / Supabase (do NOT rely on Hibernate alone in production).
-- Fixes: column reminder_zone_id does not exist

ALTER TABLE daily_reminder_configs
    ADD COLUMN IF NOT EXISTS reminder_zone_id VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata';

-- Optional: dedupe guard column used by scheduler (safe if already present)
ALTER TABLE daily_reminder_configs
    ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMP;

COMMENT ON COLUMN daily_reminder_configs.reminder_zone_id IS 'IANA timezone for reminder wall-clock (e.g. Asia/Kolkata)';
