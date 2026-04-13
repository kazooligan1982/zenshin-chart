# e2e-vision — Autonomous UI Testing Pipeline

5-layer autonomous UI testing for ZENSHIN CHART.

## Architecture

```
Layer 1: Trigger     → GitHub Actions cron (nightly) / PR open / manual
Layer 2: Detect      → Playwright crawl + Claude Vision API
Layer 3: Triage      → severity classification + GitHub Issue
Layer 4: Fix         → Claude Code CLI auto-fix PR (--allowedTools safety)
Layer 5: Deploy      → Vercel Preview auto-deploy on PR
```

## Pipeline

```
crawl.ts → screenshots/ → analyze.ts → results/ → autofix.ts → GitHub Issue + PR
```

## Setup

```bash
cd e2e-vision
npm install
npm run setup          # Install Chromium

# Uses same .env.test.local as Playwright E2E tests
# Add ANTHROPIC_API_KEY if not already set
```

## Usage

```bash
# Step-by-step
npm run crawl                    # Screenshots + link checks
npm run analyze                  # Claude Vision API analysis
npm run autofix                  # GitHub Issues + auto-fix PRs
npm run autofix:dry              # Dry run (no actual changes)

# All-in-one
npm run test:vision              # crawl + analyze
npm run test:vision:fix          # crawl + analyze + autofix

# Options
npm run crawl -- --pages login,dashboard
npm run crawl -- --viewports desktop
npm run crawl:headed             # Show browser
```

## Safety

autofix.ts uses `--allowedTools` to restrict Claude Code CLI:
- Allowed: Edit, Write, Bash(git *), Bash(npm run *), Bash(npx tsc *)
- Blocked: rm, deploy, DB access, network requests
- Max 3 auto-fix PRs per run

## Files

| File | Layer | Purpose |
|------|-------|---------|
| QA_CONTEXT.md | - | ZENSHIN CHART product context for AI agents |
| config.ts | - | Page list, auth config, viewports |
| crawl.ts | 2 | Playwright screenshot + link check + console errors |
| analyze.ts | 2-3 | Claude Vision API analysis + severity triage |
| autofix.ts | 3-4 | GitHub Issue creation + Claude Code CLI auto-fix |
| vision-test.yml | 1 | GitHub Actions nightly cron |

## Cross-product

Replace `config.ts` pages + auth for other products:
- deshi-portal (Next.js + Supabase) — same structure
- Slow Picturing Dojo (React + Vite) — adjust auth flow
- Arc (React Native) — needs Maestro instead of Playwright
