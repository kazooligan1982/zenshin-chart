-- ai_insight: 週次AIインサイト（slack-weeklyで生成、ダッシュボードで表示）
ALTER TABLE momentum_scores
ADD COLUMN IF NOT EXISTS ai_insight TEXT;
