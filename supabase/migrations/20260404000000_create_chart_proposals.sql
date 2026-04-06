-- Migration: Create chart_proposals table for AI suggestion → approval → merge flow
-- Proposals store AI-extracted VRTA items pending user review before chart integration

CREATE TABLE chart_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID REFERENCES charts(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) NOT NULL,
  proposed_by UUID REFERENCES auth.users(id) NOT NULL,
  source TEXT NOT NULL,                    -- 'ai_brainstorm', 'ai_structurize', 'ai_tool_sync', 'manual'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'partial'
  title TEXT,
  items JSONB NOT NULL,                    -- [{type, action, title, description, tension_ref, ...}]
  metadata JSONB,                          -- {session_id, conversation_excerpt, structural_diagnosis, ...}
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chart_proposals_chart_id ON chart_proposals(chart_id);
CREATE INDEX idx_chart_proposals_status ON chart_proposals(status);
CREATE INDEX idx_chart_proposals_workspace_id ON chart_proposals(workspace_id);

ALTER TABLE chart_proposals ENABLE ROW LEVEL SECURITY;

-- SELECT: All workspace members can view proposals
CREATE POLICY "Workspace members can view proposals"
  ON chart_proposals FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- INSERT: editor, consultant, owner can create proposals
CREATE POLICY "Editors and above can create proposals"
  ON chart_proposals FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'consultant', 'editor')
    )
  );

-- UPDATE: only owner and consultant can approve/reject (update status, reviewed_by, reviewed_at)
CREATE POLICY "Owner and consultant can update proposals"
  ON chart_proposals FOR UPDATE
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'consultant')
    )
  );

-- DELETE: only owner can delete proposals
CREATE POLICY "Owner can delete proposals"
  ON chart_proposals FOR DELETE
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );
