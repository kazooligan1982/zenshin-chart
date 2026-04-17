import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Path is duplicated in tests/e2e/auth.setup.ts; keep them in sync.
const STORAGE_STATE = path.join(__dirname, "tests/e2e/.auth/user.json");

// Lightweight .env.test.local loader (avoids adding a dotenv dependency).
// Only loads variables that are not already set in the environment.
const envFile = path.join(__dirname, ".env.test.local");
if (existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // E2E mutates shared workspace data; serialize to avoid races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Public smoke tests that don't require authentication.
    {
      name: "public",
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // One-time login that produces a storageState file consumed by `authed`.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // All authenticated tests reuse the storageState produced by `setup`.
    {
      name: "authed",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /.*\.public\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE,
      },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
