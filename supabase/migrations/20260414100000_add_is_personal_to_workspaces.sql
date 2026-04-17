-- Add is_personal flag to workspaces table
-- TRUE for auto-created default workspace per user, FALSE for user-created workspaces

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing default workspaces as personal
-- A personal workspace is the earliest-created workspace where the user is owner
UPDATE workspaces w
SET is_personal = TRUE
WHERE w.id IN (
  SELECT DISTINCT ON (wm.user_id) w2.id
  FROM workspaces w2
  JOIN workspace_members wm ON wm.workspace_id = w2.id AND wm.role = 'owner'
  WHERE w2.owner_id = wm.user_id
  ORDER BY wm.user_id, w2.created_at ASC
);
