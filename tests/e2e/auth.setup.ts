import { test as setup, expect } from "@playwright/test";
import path from "path";

// Storage state file path - kept in sync with playwright.config.ts.
const STORAGE_STATE = path.join(__dirname, ".auth", "user.json");

/**
 * One-time auth setup. Logs in via the real login form and persists the
 * resulting cookies / localStorage to disk so subsequent tests can reuse the
 * session via Playwright's `storageState` config.
 *
 * Requires environment variables in .env.test.local (loaded via dotenv in
 * playwright.config.ts):
 *   E2E_TEST_EMAIL=...
 *   E2E_TEST_PASSWORD=...
 *
 * The test user must already exist in the live Supabase project and belong to
 * at least one workspace with editor-or-higher role.
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test.local. " +
        "See tests/e2e/README.md for setup instructions."
    );
  }

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /log\s?in|ログイン/i }).click();

  // Wait for redirect away from /login. The destination depends on whether the
  // user has a default workspace, so we just assert we left the auth page.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15000,
  });

  // Sanity check: a logged-in user can hit /charts without being bounced.
  await page.goto("/charts");
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: STORAGE_STATE });
});
