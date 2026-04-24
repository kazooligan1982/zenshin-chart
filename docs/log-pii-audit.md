# Log PII Audit — ZENSHIN CHART

**対象タスク**: #86exa38cq (PII Safe Logger)
**ブランチ**: `feat/pii-safe-logger` (from `develop`)
**監査日**: 2026-04-24
**対象範囲**: ワーキングツリー全体（`node_modules` / `.next` / `dist` / `.claude/worktrees` / `playwright-report` / `test-results` を除外）

---

## TL;DR

- **本番リポには Sentry は未導入**（`package.json` に `@sentry/*` なし、sentry.config もなし）。
- **独自 logger は未実装**（`lib/logger.ts` 存在せず）。
- すべての `console.*` は **Vercel Logs（stdout/stderr, 最大7日保持）** に直行する。
- 実ユーザー（Fritz本人 / 麦ちゃん / RFCちかさん）のチャート内容・氏名・招待情報が Vercel Logs に出ている可能性が高い箇所を特定した。

---

## サマリー

| 指標 | 値 |
|---|---|
| 総 `console.*` 呼び出し | **453 行** |
| 対象ファイル数 | **74 ファイル** |
| 🟢 Green（安全・そのまま） | 約 **55 件** (~12%) |
| 🟡 Yellow（ID系・要加工） | 約 **75 件** (~17%) |
| 🔴 Red（PII リスク・要削除 or sanitize） | 約 **323 件** (~71%) |

> 分類の Red/Yellow 判定は「Supabase/Anthropic の error オブジェクトが失敗行の中身・APIレスポンス断片を含み得る」という前提に立っている。実際には空のこともあるが、**「ログに出したPIIは後から消せない」原則に従い安全側に倒して分類**している。

### ホットスポット（件数 top 5）

| ファイル | console.* 件数 | 主な色 |
|---|---|---|
| `app/workspaces/[wsId]/charts/[id]/actions.ts` | **105** | 🔴 |
| `lib/supabase/queries.ts` | **74** | 🔴 |
| `e2e-vision/autofix.ts` / `analyze.ts` / `crawl.ts` | 15 + 9 + 15 = **39** | 🟢 (dev-only) |
| `app/api/proposals/approve/route.ts` | **12** | 🔴 |
| `lib/supabase/charts.ts` | **12** | 🟡🟢 |

---

## 3 カテゴリ分類

### 🟢 Green（安全、そのまま OK）

**共通特徴**: 定数文字列のみ・設定ヘルスチェック・状態ラベル。ユーザーデータは流れない。

| 箇所 | 内容 | 判定理由 |
|---|---|---|
| `lib/supabase.ts:12,15` | `"[Supabase] ⚠️ URLが正しい形式ではありません…"` | 環境変数フォーマットチェック |
| `lib/supabase/charts.ts:6-8` | `"[getAllCharts] Supabase client not initialized."` / `"URL: 設定済み/未設定"` | bool 表現のみ（値は出さない） |
| `lib/supabase/charts.ts:27,29,31` | テーブル未作成／RLS／APIキー エラーの定型文 | 定数 |
| `project-editor.tsx:898,910` | `console.group("📊 ZENSHIN Structured Data")` / `console.groupEnd()` | ラベルのみ |
| `project-editor.tsx:907` | `console.warn(t("orphanActionsNote"))` | i18n 定型文 |
| `app/api/ai/coach/route.ts:132,171,236,311` | `"AI …: retrying (attempt N/M)..."` | retry counter のみ |
| `app/api/ai/structurize/route.ts:102` | `"AI structurize: retrying..."` | 同上 |
| `app/api/cron/slack-summary/route.ts:17` | `"[Slack Summary] SLACK_WEBHOOK_URL is not set"` | 設定チェック |
| `e2e-vision/*.ts` (全39件) | CI/dev スクリプトの進捗表示 | Vercel には流れない。`ts-node` ローカル実行 |
| `app/workspaces/[wsId]/charts/[id]/actions.ts` の `"失敗"` / `"[add*] 失敗 - result is null"` 系 | 定型文のみ・第2引数なし | 約 20 箇所 |
| `useDndHandlers.ts` 等の `"Sort order update failed:"` | `error` が Supabase 以外の内部エラーだけなら 🟡／内容次第 | 今回は「Sort order のみ」で chart 内容を含まない前提 → 🟢 寄り（要 Step 2 で最終判定） |

**小計**: 約 55 件

### 🟡 Yellow（ID系・chart title・要ハッシュ化 or 要約）

**共通特徴**: UUID / workspace_id / chart_id / chart title / user_id など。単独では識別に使えなくても、複数ログの突き合わせで足跡追跡が可能。

| 箇所 | 内容 | 対処方針 |
|---|---|---|
| `app/invite/[token]/page.tsx:60` | `console.log("[invite] workspace from JOIN:", { wsData, workspaceName })` | **🔴 寄り**。`workspaceName` は会社名／個人名（PII）。完全削除が望ましい |
| `app/invite/[token]/page.tsx:69` | `console.log("[invite] workspace from separate query:", { workspace_id, ws, wsError, workspaceName })` | 同上・**🔴 寄り** |
| `app/api/cron/slack-weekly/route.ts:98` | `"[Slack Weekly] Supabase charts error for workspace", ws.id, chartsError` | `ws.id` はハッシュ化 |
| `app/api/cron/slack-weekly/route.ts:251` | `` `[Slack Weekly] Error for chart ${master.title}:`, err `` | **chart title は PII** (麦ちゃんのクライアント名が入り得る) → タイトルは出さずに `chartId` hash のみ |
| `app/api/cron/tree-snapshot/route.ts:75,88,94` | `` `[Tree Snapshot] Saved: ${master.title} (${snapshotId})` `` | 同上。title 削除 |
| `app/workspaces/[wsId]/settings/general/actions.ts:68,79` | `"[deleteWorkspace] charts:", chartsError` / `"[deleteWorkspace] workspace:", error` | Supabase error 内容要精査 (🔴 寄り) |
| `app/workspaces/[wsId]/settings/members/actions.ts:72,99` | `"Invitation insert error:"` / `"Email send failed:"` | email 文字列がメッセージに入り得る → 🔴 寄り |
| `components/sidebar.tsx:132,179`, `components/user-menu.tsx:47` | `"Failed to create workspace:", error` 等 | `error.message` のみに絞る |
| `lib/workspace.ts:144,222,390,417,430` | `"Failed to create invitation:"` / `"[joinWorkspaceByInvite] Failed..."` | 招待メール／workspaceName が error に混入し得る |
| e2e-vision `autofix.ts`, `crawl.ts`, `analyze.ts` の URL / page 名 | `${currentUrl}`, `${baseUrl}` | URL 内 chartId などは切り詰め |

**小計**: 約 75 件

### 🔴 Red（PII 含有リスク大・削除 or 本格 sanitize 必須）

**共通特徴**: Supabase / Anthropic の **error オブジェクトそのもの** を `console.error(msg, error)` の形で投げている。Supabase は制約違反時に `error.details` / `error.hint` に「Failing row contains (…列の実値…)」を出す仕様 → **Vision/Reality/Tension/Action 本文や email がそのまま Vercel Logs に流れる**。

#### 🔴-1: AI 経由の Vision/Reality/Tension/Action 挿入エラー

| 箇所 | 理由 |
|---|---|
| `app/api/ai/apply/route.ts:158,184,202,222,243` | `"[ai/apply] visions/realities/tensions/actions insert error:", error` — `error.details` に失敗行の `content` (=ユーザー入力本文) が入る |
| `app/api/proposals/approve/route.ts:141,190,207,227,251,273,286,300,326,340,363,382` | `"[proposals/approve] * insert error:", error` — 同上、しかも proposal なので AIが生成した chart 本文が丸ごと |

#### 🔴-2: Chart 編集フロー（actions.ts の 105 件、約 95% が Red）

| 箇所 | 理由 |
|---|---|
| `app/workspaces/[wsId]/charts/[id]/actions.ts:533,591,649,757,847,883,1079,1198,1317,…` | `"❌ Supabase update error:", error` が **全 VRT/A 列の更新箇所に出ている** → Vision本文・Reality本文・Tension本文・Action本文が失敗時に Vercel Logs に流れる |
| 同ファイル `1613,1636,1643` | `[createSnapshot]` の error — スナップショット全体が error.details に入り得る |
| 同ファイル `1469` | `"[Server] telescopeActionPlan error:"` — 親 Action 本文が含まれる |
| `app/workspaces/[wsId]/charts/[id]/hooks/*Handlers.ts/tsx` (約 25 件) | `[handleAdd*] エラー:` / `[handleUpdate*] エラー:` — クライアントから渡された input と error |

#### 🔴-3: Supabase 汎用 queries（lib/supabase/queries.ts の 74 件）

| 箇所 | 理由 |
|---|---|
| `lib/supabase/queries.ts:30-32` | `"Error code/message/details:", chartError.code/message/details` — **details は PII ほぼ確定** |
| `lib/supabase/queries.ts:361,504` | `"Error details:", JSON.stringify(error, null, 2)` — **完全な error を JSON 化して吐いている（最悪）** |
| 同 76-79, 218, 263, 360-385, 414-472, 503-587, 612-684, 706-774, 798-846, 887-955, 975, 1003-1009, 1040-1138, 1222-1276, 1315-1507 | すべて CRUD 系で error に失敗行が載る可能性あり |

#### 🔴-4: AI 会話系（err.message に prompt 断片が入るケース）

| 箇所 | 理由 |
|---|---|
| `app/api/ai/coach/route.ts:136,177,240,316` | `"AI * error:", err?.message || err` — Anthropic SDK は prompt の一部を error message に含めることがある |
| `app/api/ai/structurize/route.ts:107` | 同上 |
| `components/ai-coach-button.tsx:255,313,358,379,501,550` | `"AI Coach error:", error` / `"Structurize error:"` / `"Save proposal error:"` — クライアント側エラー、input 丸ごと含まれ得る |
| `components/unified-detail-modal/DetailsEditor.tsx:178` | `"[DetailsEditor] AI assist error:", error` — アシスト対象の本文 |

#### 🔴-5: コメント・履歴（ユーザー記述本文）

| 箇所 | 理由 |
|---|---|
| `actions.ts:960,975,986` | `"[createComment] Auth Error:"` / 挿入時の error — comment 本文含有 |
| `actions.ts:1151,1166,1177,1270,1285,1296` | `createVisionComment`, `createRealityComment` も同様 |
| `components/item-detail-panel.tsx:85,96,107,169` | コメント取得失敗ログ |
| `components/unified-detail-modal/RightPane.tsx:171,184` | `fetchComments / chart-history error` |
| `components/unified-detail-modal/ChangeHistorySummary.tsx:145` | 履歴フェッチエラー |

#### 🔴-6: Slack OAuth / Email / Auth

| 箇所 | 理由 |
|---|---|
| `app/api/slack/callback/route.ts:61,88` | `"Slack OAuth error:", tokenData.error` / `"DB save error:"` — token や slack 情報が error に含まれる可能性 |
| `lib/email.ts:55` | `"Failed to send invitation email:", error` — 宛先 email が error に入る |
| `components/auth/signup-form.tsx:47`, `login-form.tsx:33`, `oauth-buttons.tsx:37` | `"Signup/Login/Google login error:", error` — email を含み得る |
| `app/(auth)/forgot-password/page.tsx:44,53`, `reset-password/page.tsx:41,89,99` | パスワードリセット系 error、email を含む |

**小計**: 約 323 件

---

## 外部流出経路の確認

### Sentry
- ❌ **未導入**（`package.json` に `@sentry/*` 系パッケージなし）
- ❌ `sentry.client.config.ts` / `sentry.server.config.ts` も存在しない
- → **今回の Step 2 で導入するか見送るかを Kaz と決める必要あり**

### Vercel Logs
- ✅ **全 console.* が対象**（Next.js のサーバー／クライアントどちらも stdout に流れる）
- 保存期間: Hobby plan は 1 時間、Pro plan は 1 日〜数日（プロジェクト設定依存）
- 実時間でダッシュボードから検索可能 → チーム内でも閲覧できる導線がある

### Supabase Logs
- ✅ Supabase は全 SQL をログ記録する（API logs, DB logs）
- WHERE 句に email / user_id が入る query は Supabase 側にも残る
- 今回のスコープ外（次の Step でアプリ側のログを直してから、Supabase 側は別タスクで検討）

---

## Step 2 への引き継ぎ事項（Kaz 確認事項）

1. **Sentry を導入するか？**
   - 導入するなら `@sentry/nextjs` + `beforeSend` フックも Step 2-3 で同時実装
   - 見送るなら `lib/logger.ts` で stdout マスキングのみ
2. **`e2e-vision/*.ts` は対象に含めるか？**
   - CI/ローカルの dev script で Vercel Logs には流れないので優先度低いと判断した
   - ただし明示的に除外するなら `docs/log-pii-audit.md` に明記すべき
3. **`actions.ts` の 100 件超を一気に置換するか、段階的にするか？**
   - 一気にやると diff 巨大化で review 困難
   - Red 優先 → Yellow → Green の3段階 commit を推奨
4. **Supabase error 内部の `details` / `hint` フィールドを logger が一律 redact する方針で OK か？**
   - OK なら `sanitize()` に `details` / `hint` / `code` (code はむしろ欲しいので残す) のキーベース除去を追加

---

## 参考: 生 grep 出力

- 生出力: `/tmp/zc-console.txt`（453 行、本 audit 後は削除）
- grep コマンド:

  ```bash
  grep -rn "console\." \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.cjs" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
    --exclude-dir=worktrees --exclude-dir=playwright-report --exclude-dir=test-results \
    .
  ```
