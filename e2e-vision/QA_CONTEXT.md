# ZENSHIN CHART — QA Context

## Product Overview
Structural Tension Charting SaaS based on Robert Fritz's VRTA framework.
Helps structural consultants and their clients visualize Vision → Reality → Tension → Action.

## VRTA Semantic Colors
- **Vision (V)** = emerald green (#10B981)
- **Reality (R)** = orange (#F97316)
- **Tension (T)** = sky blue (#0EA5E9)
- **Action (A)** = slate gray (#64748B)

These colors MUST be consistent across all pages. Any deviation is a visual regression.

## Dual Route Architecture (CRITICAL)
Every chart page exists at TWO routes that must render identically:
- `/charts/[id]` — direct chart access
- `/workspaces/[wsId]/charts/[id]` — workspace-scoped access

Any UI bug found on one route MUST be checked on both. Fixes MUST apply to both:
- `app/charts/[id]/page.tsx`
- `app/workspaces/[wsId]/charts/[id]/page.tsx`

## Auth
- Supabase Auth (email/password + Google OAuth)
- Login page: `/login`
- Post-login redirect: `/workspaces/[wsId]/charts`

## 4 Roles (permission-gated UI)
| Role | Can view | Can edit V/R/T/A | Can approve proposals | Can delete |
|------|----------|------------------|-----------------------|------------|
| viewer | Yes | No | No | No |
| editor | Yes | Yes | No | No |
| consultant | Yes | Yes | Yes | No |
| owner | Yes | Yes | Yes | Yes |

## Key UI Components
- **Chart Editor**: Main workspace. V/R/T/A items in columns.
- **Action Modal**: Click action → detail modal with comments, status, external links.
- **Proposals Panel**: Slide-over from right. Shows pending AI proposals with approve/reject.
- **AI Coach (brainstorm)**: Chat interface for structural consultation.
- **Snapshot**: Point-in-time chart capture for comparison.
- **Dashboard**: Workspace overview with chart list.

## Known Sensitive Areas
- Comment submission (Tiptap editor, Cmd+Enter to submit)
- Proposal approve flow (items JSONB with multiple types)
- Chart title auto-save on blur/Tab
- Vision/Reality inline input (Enter to submit)
- Tension creation with Vision/Reality linking

## Fritz Terminology Rules
| English | Correct Japanese | Forbidden |
|---------|-----------------|-----------|
| oscillating structure | 葛藤構造 | 振動パターン |
| advancing structure | 前進構造 | 前進パターン |
| structural tension | 構造的緊張 | 構造的テンション |
| current reality | 現状 | 現在の現実 |
