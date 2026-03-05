-- momentum_scores: 週次前進スコアを記録（先週比用）
CREATE TABLE IF NOT EXISTS momentum_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chart_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_momentum_scores_chart_week ON momentum_scores(chart_id, week_start DESC);
