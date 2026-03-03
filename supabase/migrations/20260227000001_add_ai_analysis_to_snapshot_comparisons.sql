-- Add ai_analysis column to snapshot_comparisons for storing AI comparison analysis
ALTER TABLE snapshot_comparisons
ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
