-- Fix: Add ON DELETE CASCADE to chart_proposals.workspace_id
-- Without this, workspace deletion fails with FK constraint violation

ALTER TABLE chart_proposals
  DROP CONSTRAINT IF EXISTS chart_proposals_workspace_id_fkey;

ALTER TABLE chart_proposals
  ADD CONSTRAINT chart_proposals_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
