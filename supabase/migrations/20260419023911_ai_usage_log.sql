-- AI usage logging & rate limiting
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  workspace_id UUID REFERENCES workspaces(id),
  endpoint TEXT NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_date ON ai_usage_log(workspace_id, created_at);

-- RLS
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own usage" ON ai_usage_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- INSERT is done via service role client (bypasses RLS)
