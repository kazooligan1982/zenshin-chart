-- Add slack_notify column to workspaces for Slack daily summary opt-in
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slack_notify BOOLEAN NOT NULL DEFAULT FALSE;
