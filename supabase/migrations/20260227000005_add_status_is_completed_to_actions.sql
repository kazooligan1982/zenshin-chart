-- actionsテーブルにstatus, is_completedカラムを追加（既存コードで使用されているがスキーマに未定義の可能性）
ALTER TABLE actions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'todo';
ALTER TABLE actions ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
