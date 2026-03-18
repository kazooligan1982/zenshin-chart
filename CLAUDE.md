# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

Next.js 15 (App Router) + React 19 + Supabase で構築されたWebアプリケーション。
国際化に next-intl、UIコンポーネントに Radix UI (shadcn/ui) を使用。

## 既知のバグ・制約

### React 19 の use(thenable) フックバグ (重要)

**問題**: Next.js Router 内部の `useActionQueue` が `use(thenable)` を条件付きで呼び出しており、
Suspense境界 + hydration + Strict Modeのダブルレンダーが重なると、Reactのフック検証が
「Rendered more hooks than during the previous render」エラーを誤検知する。

- React本体のバグ: https://github.com/facebook/react/issues/33580
- 修正PR (未マージ): https://github.com/facebook/react/pull/35717
- Next.js側の関連issue: https://github.com/vercel/next.js/issues/63121

**対処**:
- `next.config.ts` で `reactStrictMode: false` を設定済み（ダブルレンダーの回避）
- ナビゲーションを伴うデータ変更（例: ワークスペース削除）では、`useState` による状態更新を
  避け、`useRef` + DOM操作で UI を更新すること。React の再レンダーが Router の
  `use(thenable)` バグを誘発するため。
- ナビゲーションには `window.location.href` を使用し、Next.js Router を完全にバイパスする。
- **TODO**: React の修正PR (#35717) がマージされたら `reactStrictMode: true` に戻す。

### Server Action + redirect() の制約

Server Action 内で `redirect()` を呼ぶと、クライアント側で Next.js Router の
フックバグを誘発する可能性がある。データ変更後にリダイレクトが必要な場合は、
API Route (fetch) + `window.location.href` のパターンを使うこと。
