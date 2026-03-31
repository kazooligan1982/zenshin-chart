# ZENSHIN CHART

## Overview
Robert Fritzの構造コンサルティングメソッドに基づくSaaS。Vision→Reality→Tension→Actionフレームワーク。

## Tech Stack
- **Frontend**: Next.js 15 (App Router, TypeScript, Tailwind CSS)
- **Backend**: Supabase (Auth / PostgreSQL / Storage / Edge Functions)
- **Hosting**: Vercel
- **i18n**: next-intl (en/ja)

## Commands
```bash
npx next dev --hostname 0.0.0.0          # Dev server（M5用、外部アクセス可）
npm run build                             # Production build
npm run lint                              # ESLint
```

## Dev Server
- ポート: 3000
- 確認URL: http://100.124.87.5:3000（M1 Proブラウザから）
- ⚠️ `npm run dev` だけだとlocalhostにバインドされるので必ず `--hostname 0.0.0.0` をつける

## VRTA カラー（厳守）
- Vision = emerald
- Reality = orange
- Tension = sky
- Action = slate

## 必須ルール: 両方編集
変更は必ず以下の2箇所に適用すること：
- `app/charts/[id]/`
- `app/workspaces/[wsId]/charts/[id]/`

## Fritz原則
- Vision→Reality→Tension→Action
- "Start with nothing" — 純粋なN=1観察、比較からは入らない
- インサイトは深いソロ分析の後に生まれる

## GitHub
- リポジトリ: kazooligan1982/zenshin-web
- デプロイ: GitHub → Vercel（自動）

## .env
- `.env.local` が必要（GitHubに上がらない）
