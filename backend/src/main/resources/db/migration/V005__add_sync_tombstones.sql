-- V005: Add sync_tombstones table for reliable deletion propagation across devices
CREATE TABLE IF NOT EXISTS sync_tombstones (
    id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    user_id UUID NOT NULL,
    deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user ON sync_tombstones(user_id, deleted_at DESC);
