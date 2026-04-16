-- =============================================================
-- Migration: RLSセキュリティ修正 — anonymousポリシー削除
-- Date: 2026-04-15
-- Purpose: 認証不要で全操作可能だったポリシーを削除/修正
-- Affected: action_comments, vision_comments, reality_comments,
--           item_history, snapshot_comparisons
-- =============================================================

-- --------------------------------------------------------
-- 1. action_comments: anonymous + 重複ポリシー削除、authenticated SELECT追加
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous select" ON action_comments;
DROP POLICY IF EXISTS "Allow anonymous insert" ON action_comments;
DROP POLICY IF EXISTS "Allow anonymous update" ON action_comments;
DROP POLICY IF EXISTS "Allow anonymous delete" ON action_comments;
DROP POLICY IF EXISTS "Public actions are viewable by everyone" ON action_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON action_comments;
DROP POLICY IF EXISTS "Users can insert their own comments" ON action_comments;
DROP POLICY IF EXISTS "Users can update own comments" ON action_comments;

-- 認証済みユーザーが全コメントを閲覧可能（他テーブルと統一）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'action_comments' AND policyname = 'action_comments_select'
  ) THEN
    CREATE POLICY "action_comments_select"
    ON action_comments FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

-- --------------------------------------------------------
-- 2. vision_comments: anonymous ポリシー削除
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous select" ON vision_comments;
DROP POLICY IF EXISTS "Allow anonymous insert" ON vision_comments;
DROP POLICY IF EXISTS "Allow anonymous update" ON vision_comments;
DROP POLICY IF EXISTS "Allow anonymous delete" ON vision_comments;

-- --------------------------------------------------------
-- 3. reality_comments: anonymous ポリシー削除
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous select" ON reality_comments;
DROP POLICY IF EXISTS "Allow anonymous insert" ON reality_comments;
DROP POLICY IF EXISTS "Allow anonymous update" ON reality_comments;
DROP POLICY IF EXISTS "Allow anonymous delete" ON reality_comments;

-- --------------------------------------------------------
-- 4. item_history: 全操作許可 → authenticated限定
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on item_history" ON item_history;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'item_history' AND policyname = 'item_history_select'
  ) THEN
    CREATE POLICY "item_history_select"
    ON item_history FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'item_history' AND policyname = 'item_history_insert'
  ) THEN
    CREATE POLICY "item_history_insert"
    ON item_history FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'item_history' AND policyname = 'item_history_update'
  ) THEN
    CREATE POLICY "item_history_update"
    ON item_history FOR UPDATE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'item_history' AND policyname = 'item_history_delete'
  ) THEN
    CREATE POLICY "item_history_delete"
    ON item_history FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- --------------------------------------------------------
-- 5. snapshot_comparisons: INSERT を authenticated限定に
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can create comparisons" ON snapshot_comparisons;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'snapshot_comparisons'
      AND policyname = 'Authenticated users can create comparisons'
  ) THEN
    CREATE POLICY "Authenticated users can create comparisons"
    ON snapshot_comparisons FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;
