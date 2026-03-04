-- Add scope and trigger_type columns to snapshots for Tree Snapshot support
ALTER TABLE snapshots
ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'single',
ADD COLUMN IF NOT EXISTS trigger_type TEXT;

-- single = 従来の単一チャートスナップショット
-- tree = マスター+配下全チャートの Tree Snapshot
