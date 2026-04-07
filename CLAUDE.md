## TODO（優先）
- [ ] `npm audit fix` を実行してビルド確認する（High脆弱性 3件: undici関連）

# ZENSHIN CHART — Claude Code ガイド

> 「緊張構造で前進を生み出すプラットフォーム」
> Robert Fritz の「構造的テンション」理論に基づく思考・創造活動支援SaaS

---

## 開発環境

このプロジェクトはM5 MacBook Air（クラムシェルモード）上にある。
Kazは M1 Pro の Cursor から Remote SSH: brain-bot で接続して開発する。

- **Dev server**: `npx next dev --hostname 0.0.0.0`（ポート3000）
- **確認URL**: http://100.124.87.5:3000（M1 Proブラウザから）
- **⚠️ `npm run dev` だけだとlocalhostにバインドされ外部アクセス不可。必ず `--hostname 0.0.0.0` をつける**
- **GitHub**: kazooligan1982/zenshin-web
- **デプロイ**: GitHub → Vercel（自動）、本番URL: zenshin-web-alpha.vercel.app
- **ブランチ保護**: main への直接コミット禁止。develop からのマージのみ
- **.env**: `.env.local` が必要（GitHubに上がらない）
- **Vercel Cron**: `vercel.json` で設定済み
  - slack-summary: 毎日 JST 9:00
  - slack-weekly: 毎週月曜 JST 9:00
  - 認証ヘッダー: `Authorization: Bearer zenshin-tree-snapshot-cron-secret-2026`
  - テスト: `curl -H "Authorization: Bearer zenshin-tree-snapshot-cron-secret-2026" https://zenshin-web-alpha.vercel.app/api/cron/slack-summary`

---

## ブランチ戦略

| ブランチ | 役割 | デプロイ先 |
|----------|------|-----------|
| `main` | 本番ブランチ。直接コミット禁止。develop からのマージのみ | Vercel Production（zenshinchart.com） |
| `develop` | 開発ブランチ。日常の開発はここで行う | Vercel Preview（自動プレビューURL） |
| `feature/xxx` | 大きな機能開発時に develop から切る（任意） | Vercel Preview |

### ワークフロー

1. 日常の開発は `develop` で行う
2. Vercel Preview URL で動作確認
3. 確認OK なら `develop` → `main` にマージ（PR経由）
4. `main` へのマージ = 本番デプロイ

### Claude Code 使用時のルール

- **作業ブランチは常に `develop`**（または develop から切った feature ブランチ）
- `main` に直接コミット・プッシュしないこと
- コミット前に `git branch` で現在のブランチを確認すること

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 15 (App Router) |
| DB | Supabase + RLS |
| ホスティング | Vercel |
| CSS | Tailwind v4 |
| UI | shadcn/ui |
| i18n | next-intl (ja/en) |
| リッチテキスト | Tiptap |
| トースト | sonner |
| D&D | dnd-kit |
| テスト | Vitest + Playwright + GitHub Actions |

---

## ★★★ 絶対ルール（これを破ると壊れる）

### 1. 必ず両方のパスを編集する

変更は**必ず**以下の2箇所に適用すること：
- `app/charts/[id]/`
- `app/workspaces/[wsId]/charts/[id]/`

片方だけ変更すると、ワークスペース経由とダイレクトアクセスで挙動が食い違う。

### 2. VRTA カラー（厳守）

| 概念 | カラー | 用途 |
|------|--------|------|
| Vision | emerald | 理想の状態 |
| Reality | orange | 現在の状態 |
| Tension | sky | V と R のギャップ |
| Action | slate | 具体的な行動 |

### 3. Fritz原則（プロダクトの哲学的基盤）

- **Vision→Reality→Tension→Action** — この順序が全ての基盤
- **"Start with nothing"** — 純粋なN=1観察、比較からは入らない
- **インサイトは深いソロ分析の後に生まれる**
- **AIは答えを出すのではなく、問いを投げるコーチ**
- **緊張構造が張られている限り、人は創造に向かって動き続ける**

### 4. Cursor/Claude Code 使用時の注意

- **Cursor が `toast.success(...)` を `toast.success\`...\`` に書き換えることがある** → 修正後必ず確認
- **同様に `revalidatePath(...)` も壊れやすい** → 修正後必ず確認
- 確認: `grep -n 'toast\.success' file | grep -v 'toast\.success('`
- 巨大ファイルでの修正は暴走リスク高 → 影響範囲を限定して指示する
- **「これだけ修正してください。他は変更しないでください。」と必ず付ける**

---

## コア概念モデル

```
Vision（理想）──┐
                ├──→ Tension（ギャップ）──→ Action（行動）
Reality（現実）─┘
```

- Vision/Reality の間に Tension が生まれる
- Tension にタグ（Area）が紐づく
- Action は Tension 配下に属する
- Action のタグは Tension から継承（Action個別のタグ変更は不要）
- Action はテレスコープで子チャート化可能（子チャート完了→親Action自動完了）

### ステータス

- **Chart.status**: `"active" | "completed"`
- **TensionStatus**: `"active" | "review_needed" | "resolved"`
- **ActionPlan.status**: `"todo" | "in_progress" | "done" | "pending" | "canceled"`

---

## 画面構成

### システム全体像

```
Editor（創造）→ Views（実行）→ Snapshot（観測）
                    ↓
            HOME / Dashboard（俯瞰）
                    ↓
              AI Coach（伴走）
```

| 機能 | 役割 | 状態 |
|------|------|------|
| Editor | V/R/T/Aを描く | ✅ 実装済み |
| Views (カンバン) | ステータス別Action管理 | ✅ 実装済み |
| Views (ツリー) | 階層構造可視化 | ✅ 実装済み |
| Snapshot | 手動取得・比較・保存 | ✅ Phase 1+2 完了 |
| Comparison AI | AI差分分析 + 履歴リデザイン | ✅ 完了 |
| Slack統合 | 日次サマリー・週次レポート | ✅ 完了 |
| Workspace設定 | General設定ページ | ✅ 完了 |
| Audit Logs | 監査ログ + Workspaceロール | ✅ テーブル作成済み |
| i18n | 日英対応（next-intl） | ✅ 基盤完了 |
| Dashboard | モメンタム指標・期間フィルタ | 🔜 未実装 |
| AI Coach | Fritz教えベースのコーチング | 🔜 未実装 |
| Onboarding | 初回ユーザーガイド | 🔜 未実装 |

### 対比モード（Comparison View）

V/R をタグ（Area）ごとに横並びで表示。上部: V/R対比（編集可能）、下部: T&A（フルwidth）。

### 統一モーダル設計（Unified Modal）

Action編集等のモーダルUIは統一設計済み。Phase 1〜3で段階的に実装。
詳細は `UNIFIED-MODAL-DESIGN.md` および `UNIFIED-MODAL-PHASE1.md` / `PHASE2.md` / `PHASE2-FIX.md` を参照。

---

## ファイル構成（主要）

```
app/
├── charts/
│   ├── page.tsx                    # チャート一覧
│   ├── chart-card.tsx
│   └── [id]/
│       ├── page.tsx                # チャート詳細
│       ├── project-editor.tsx      # メインエディタ（巨大ファイル、分割検討中）
│       ├── actions.ts              # Server Actions
│       ├── dashboard/page.tsx
│       └── kanban/
├── workspaces/
│   └── [wsId]/
│       ├── charts/[id]/            # ★ app/charts/[id]/ と同じ構造を維持 ★
│       ├── dashboard/
│       │   ├── page.tsx
│       │   ├── momentum-score-card.tsx   # 前進スコアカード
│       │   └── momentum-trend-chart.tsx  # 前進スコア推移グラフ
│       └── settings/
│           ├── page.tsx
│           ├── general/            # Workspace一般設定
│           ├── members/
│           └── archive/
├── api/
│   ├── cron/slack-summary/         # 日次Slackサマリー（JST 9:00）
│   └── cron/slack-weekly/          # 週次Slackレポート（月曜JST 9:00）
components/
├── action-timeline/
├── tag/TagManager.tsx
├── locale-switcher.tsx
├── sidebar.tsx
├── ui/
lib/
├── supabase/queries.ts             # DB取得・更新（server createClient() 統一済み）
├── momentum-score.ts               # モメンタムスコア計算
├── permissions.ts                  # ロール別権限ヘルパー
├── workspace-search.ts
├── locale.ts                       # 言語判定
messages/
├── ja.json                         # 日本語翻訳
├── en.json                         # 英語翻訳
i18n/
├── config.ts                       # locales定義
├── request.ts                      # next-intl設定
docs/
├── PRODUCT-VISION.md               # プロダクトビジョン（思想面の詳細）
├── HANDOFF.md                      # 開発引き継ぎ（※2026-02-14時点、古い）
├── I18N-HANDOFF.md                 # i18n実装ガイド
├── MULTI-WORKSPACE-CONSULTANT-DESIGN.md  # マルチWSコンサルタント設計
UNIFIED-MODAL-DESIGN.md             # 統一モーダル設計書
UNIFIED-MODAL-PHASE1.md             # 統一モーダル Phase 1
UNIFIED-MODAL-PHASE2.md             # 統一モーダル Phase 2
UNIFIED-MODAL-PHASE2-FIX.md         # 統一モーダル Phase 2 修正
```

---

## データベース（Supabase）

### 主要テーブル
- `workspaces` — ワークスペース（name, owner_id）
- `workspace_members` — メンバー（role: owner/consultant/editor/viewer）
- `workspace_invitations` — 招待（invite_code方式）
- `charts` — チャート（title, status, workspace_id, parent_action_id）
- `areas` — タグ（色付きカテゴリ）
- `visions` / `realities` — V/Rアイテム
- `tensions` — Tensionカード
- `actions` — Actionアイテム（status, is_completed, child_chart_id, tension_id）
- `tension_visions` / `tension_realities` — T↔V/R関連付け
- `action_comments` / `vision_comments` / `reality_comments` — タイムライン
- `snapshots` — スナップショット（再帰取得）
- `snapshot_comparisons` — 比較結果保存
- `momentum_scores` — 週次モメンタムスコア + ai_insight
- `profiles` — ユーザー情報
- `user_preferences` — locale等のユーザー設定
- `audit_logs` — 監査ログ（post-demo追加）

### RLS
全テーブルにRLS有効。workspace_membersを経由した権限チェック。
INSERT直後のRETURNINGがRLSに引っかかることがある → INSERT後に別途SELECTで対応。

### マイグレーション運用ルール
- `npx supabase db push` は古いマイグレーションと衝突しやすい
- **失敗したら Supabase Dashboard → SQL Editor で該当SQLを直接実行する**
- マイグレーションファイルの中身を `cat` で確認してからSQL Editorに貼る
- `IF NOT EXISTS` / `DROP ... IF EXISTS` を活用して冪等性を確保する

---

## ロール権限（4種）

| ロール | チャートCRUD | V/R/T/A編集 | コメント | メンバー管理 | WS設定 |
|--------|-------------|-------------|---------|-------------|--------|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| consultant | ✅ | ✅ | ✅ | ❌ | ❌ |
| editor | ❌ | ✅ | ✅ | ❌ | ❌ |
| viewer | ❌ | ❌ | ✅ | ❌ | ❌ |

consultantは外部専門家（構造コンサルタント）。複数WSに参加する想定。

---

## ZENSHINカラーパレット（UI）

| 要素 | カラー | 用途 |
|------|--------|------|
| cream | #F3F0E3 | 背景の温かみ |
| orange | #F5853F | CTA・アクティブ |
| teal | #23967F | 成功・セカンダリ |
| charcoal | #282A2E | ダークUI |
| navy | #154665 | テキスト・アクセント |

---

## 開発上の注意（地雷集）

### React / Next.js
- `useRef` は再マウントでリセット → 保持したい値はモジュールレベル変数
- スクロール位置保存は `useEffect` 内ではなくユーザー操作時点で行う
- `useSearchParams()` は `<Suspense>` ラップ必須
- Next.js 15 では `searchParams` が Promise → `await searchParams`
- `Math.random()` はレンダー中に呼べない（React 19）

### Tailwind v4
- `darkMode: ["class"]` は型エラー → `darkMode: ["class", ".dark"]`

### Supabase
- `lib/supabase/queries.ts` は必ず server `createClient()` を使う

### トラブルシューティング

| 症状 | 対処 |
|------|------|
| CSS完全崩壊 | `rm -rf .next && npm run dev` |
| `next: command not found` | `rm -rf .next node_modules package-lock.json && npm install && npm run dev` |
| `[object Event]` エラー | `toast.success` の構文確認 |
| Server Action not found | `rm -rf .next && npm run dev` |
| main に push 拒否 | PR + squash merge 必須 |
| 開発中に画面がおかしい | `rm -rf .next node_modules/.cache && npm run dev`（軽量版、まずこれを試す） |
| Supabase migration失敗 | SQL EditorでSQLを直接実行（`npx supabase db push` は衝突しやすい） |

---

## 残タスク（優先順）

### 高
- [ ] Tiptap markdown修正
- [ ] Views/Snapshot/Archive クリーンアップ
- [ ] Chart health（チャート健全性指標）
- [ ] Onboarding フロー

### 中
- [ ] project-editor.tsx 分割（巨大ファイル）
- [ ] Dashboard 期間フィルタ（Q単位）
- [ ] 変更差分ログ基盤（action_history テーブル）

### 低（将来）
- [ ] AI Coach（Fritz教えベース） — `fritz_structural_principles.md`（556行、企業名ゼロ、10章構成）が過去チャットで作成済み。AI Coachのシステムプロンプトのベースとして使う。内容: 構造思考の根本原理、2つの緊張解消システム、3 Frames（クローズアップ/ミディアム/ロングショット）、9つの葛藤パターン、重要性の階層、バックキャスティング、統合判定フロー
- [ ] D&D Tension間移動（dnd-kit構造変更）
- [ ] 外部サービス連携（Slack, GitHub, Notion）
- [ ] 課金機能

---

## RFC（ロバート・フリッツ・コンサルティング）との関係

- RFCはZENSHIN CHARTの最初のβテスター兼ビジネスパートナー
- RFCの経営データは機密 → スクリーンショット・事例紹介不可
- **2026年8月末までに事業計画を策定** する覚書あり
- RFCの役割: フィードバッカー + ディストリビューター + ブランドライセンサー
- IP所有権はU2C/Kazに帰属（弁護士確認済み）

---

## Git ワークフロー

```bash
git checkout main && git pull origin main
git checkout -b fix/branch-name
git add -A && git commit -m "fix: 説明"
git push origin fix/branch-name
gh pr create --title "fix: タイトル" --body "説明" --base main
gh pr merge --squash --delete-branch
git checkout main && git pull origin main
```

---

## 開発者プロフィール

- **Kaz（安田一斗）**: U2C Inc. 代表取締役、DeployGate共同創業者
- **開発スタイル**: VibeCoder — Cursor + Claude Code で開発
- **UI/UX感性**: 高い。設計判断は常にKazと議論して決める
- **操作**: コピペ可能なコマンド・Cursorプロンプト形式で提供すること

---

## 参照ドキュメント

| ファイル | 内容 |
|---------|------|
| `docs/PRODUCT-VISION.md` | プロダクトビジョン、AIコーチング設計思想、鮮度問題への解決策 |
| `docs/I18N-HANDOFF.md` | i18n実装の詳細ガイド（next-intl設定、翻訳ファイル構造） |
| `docs/MULTI-WORKSPACE-CONSULTANT-DESIGN.md` | マルチWSとコンサルタントロールの設計 |
| `docs/HANDOFF.md` | 開発引き継ぎ（※2026-02-14時点。最新はこのCLAUDE.mdを参照） |
| `UNIFIED-MODAL-DESIGN.md` | 統一モーダル設計（Phase 1〜3のmd群含む） |
| `fritz_structural_principles.md` | AI Coach用システムプロンプト原本（556行、Fritz構造思考の全原則、企業名なし） ※過去チャットで作成、リポジトリ外に保管 |

## コミットメッセージ規約
コミットメッセージの末尾にClickUpタスクIDを含めること。
形式: `feat/fix/refactor/docs: 内容 #86exXXXXX`
例: `feat: Proposal承認UI追加 #86ex50eam`
これによりbrain-botのgit-syncが自動でClickUpタスクにコメントを追加する。

---

## 問題診断の原則（Fritz構造思考に基づく）

問題が報告された時は、Robert Fritzの「start with nothing」を適用する。
**観念（Concept）ではなく、ありのままの現実（Current Reality）から始めること。**

### やるべきこと（この順序を厳守）
1. **現実を見る** — 実際の状態を確認する（DBにデータがあるか、ログインできるか、エラーログは何を言っているか）
2. **過去を確認する** — 関連する過去のチャットや作業ログを検索して、何が行われたかを事実ベースで把握する
3. **診断する** — 1と2の事実に基づいて原因を特定する
4. **対応する** — 事実に基づいた対応策を提案する

### やってはいけないこと
- 現実を確認せずに最悪ケースを断定する（これは観念に囚われた葛藤構造）
- 「〜に違いない」「〜のはず」で行動する（推定は推定として扱い、事実と混同しない）
- ユーザーを不安にさせてから事実確認する（順序が逆）

### なぜこのルールが必要か
2026/04/07にβテスターのログイン障害を「データ消失」と誤診断した事例から。
実際はSupabase Auth設定のSite URLがlocalhostのままだっただけ。
観念（データが消えたはず）に囚われ、現実（実際にログインしてデータを確認する）を見なかった。

## Supabase移行・削除ルール（必ず遵守）

本番Supabaseプロジェクトの移行・削除は、以下の手順を厳守すること。
**プロジェクト削除は不可逆。バックアップを含む全データが永久に消失する。**

### 移行手順（リージョン変更・プロジェクト統合等）

1. データバックアップ
   supabase db dump --db-url [旧CONNECTION_STRING] -f schema.sql
   supabase db dump --db-url [旧CONNECTION_STRING] -f data.sql --use-copy --data-only

2. 新プロジェクトにリストア
   psql -d [新CONNECTION_STRING] -f schema.sql
   psql -d [新CONNECTION_STRING] -f data.sql

3. リストア確認チェックリスト
   - auth.users のレコード数が旧と一致
   - 主要テーブルのレコード数が旧と一致
   - βテスター/顧客のログインが新環境で成功
   - RLSポリシーが正しく動作
   - Storage buckets/filesの移行（該当する場合）

4. 旧プロジェクト削除
   - リストア確認完了から最低1週間は旧プロジェクトを維持
   - βテスター全員に新環境での動作確認を依頼
   - 全員からOKが出てから削除

### 絶対にやってはいけないこと
- データダンプなしでの旧プロジェクト削除
- リストア確認なしでの旧プロジェクト削除
- βテスターへの通知なしでの環境切り替え