# E2E Tests — zenshin-chart

Playwright is the runner. The full scenario inventory lives in
[`SCENARIOS.md`](./SCENARIOS.md). This file is just the operator's guide.

## Setup (one-time)

1. **Create a dedicated test user in Supabase**
   - Recommended: `e2e-test@u2c.io` (or any address you control)
   - Project: `wglutqoufuvnzmkruewg` (zenshin-chart)
   - Make sure the user belongs to a workspace with **editor or higher**
     permissions. The recommended pattern is a dedicated workspace named
     `[E2E] Sandbox` so test data is easy to spot and clean up.

2. **Provide credentials to Playwright**
   ```bash
   cp .env.test.local.example .env.test.local
   # then edit .env.test.local with the real email + password
   ```

3. **Install Playwright browsers** (only required the first time)
   ```bash
   npx playwright install chromium
   ```

## Running

```bash
# Run the entire suite headless
npm run test:e2e

# Run a specific spec
npx playwright test tests/e2e/comments.spec.ts

# Watch the browser as tests run (extremely useful when debugging selectors)
npx playwright test --headed --project=authed

# Open the Playwright UI runner
npm run test:e2e:ui

# View the HTML report from the last run
npx playwright show-report
```

> M5 (clamshell mode) note: tests run on the same machine that hosts the dev
> server, so `localhost:3000` works. If you want to run tests against a server
> already running on a different machine, set `PLAYWRIGHT_BASE_URL` in
> `.env.test.local`.

## How the projects fit together

| Project | Files | Purpose |
|---|---|---|
| `public` | `*.public.spec.ts` | Unauthenticated smoke tests (login page renders, redirect works) |
| `setup` | `auth.setup.ts` | Logs in once via the real form, persists `tests/e2e/.auth/user.json` |
| `authed` | everything else | Reuses storage state from `setup`. `setup` is a declared dependency. |

The `authed` project always runs `setup` first, so a fresh `.auth/user.json` is
generated on every test run. Sessions older than the Supabase JWT lifetime will
be re-created automatically.

## Adding a new test

1. Add the scenario to `SCENARIOS.md` with an ID and a 🔜 status.
2. Create or extend a `*.spec.ts` file under `tests/e2e/`.
3. Prefer accessible queries (`getByRole`, `getByLabel`, `getByPlaceholder`)
   over CSS selectors. UI labels live in `messages/ja.json`.
4. Update the scenario status to ✅ when the test is implemented and passing.
5. Tag created resources with the `E2E_PREFIX` constant from
   [`helpers/test-data.ts`](./helpers/test-data.ts).

## Cleanup

Created data is tagged `[E2E]` but not yet auto-deleted. For now, manually
delete `[E2E]`-prefixed charts in the sandbox workspace if they accumulate, or
periodically reset the test workspace.

A future improvement: a `globalTeardown` script that deletes all `[E2E]` data
via the Supabase service role key.

## Known limitations (current session)

- Selectors are best-effort and may need iteration on first run; the codebase
  is in Japanese and the UI labels live in `messages/ja.json`. If a test fails
  with a "Locator not found" error, run `--headed` and adjust the selector.
- The comment regression suite (`comments.spec.ts`) is intentionally written to
  reproduce bug `#86ex792ze`. Until the bug is fixed, expect F1–F3 to fail —
  that is the **point** of the suite.
- Permission matrix tests (L1–L7 in SCENARIOS.md) are not implemented; they
  require dedicated test users for each role.
