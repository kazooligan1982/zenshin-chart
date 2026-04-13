// e2e-vision/config.ts
// ZENSHIN CHART UI Test Configuration

export interface PageConfig {
  name: string;
  path: string;
  waitFor?: string;
  public?: boolean;
  viewports?: Array<{ width: number; height: number; label: string }>;
  analysisHints?: string;
}

export interface CrawlConfig {
  baseUrl: string;
  auth: {
    email: string;
    password: string;
    loginPath: string;
    loginButtonLabel: RegExp;
    postLoginWaitUrl: RegExp;
  };
  pages: PageConfig[];
  viewports: Array<{ width: number; height: number; label: string }>;
  screenshotDir: string;
  timeout: number;
}

export const DEFAULT_VIEWPORTS = [
  { width: 1280, height: 800, label: "desktop" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 375, height: 812, label: "mobile" },
];

export function loadConfig(): CrawlConfig {
  const baseUrl = process.env.TARGET_URL || "http://localhost:3000";
  const email = process.env.E2E_TEST_EMAIL || process.env.TEST_USER_EMAIL || "";
  const password = process.env.E2E_TEST_PASSWORD || process.env.TEST_USER_PASSWORD || "";

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD (or TEST_USER_EMAIL/TEST_USER_PASSWORD) must be set in .env.test.local"
    );
  }

  return {
    baseUrl,
    auth: {
      email,
      password,
      loginPath: "/login",
      loginButtonLabel: /log\s?in|ログイン/i,
      postLoginWaitUrl: /\/(workspaces|charts)(\/|$)/,
    },
    pages: [
      {
        name: "login",
        path: "/login",
        public: true,
        waitFor: 'form button[type="submit"], input[type="email"]',
        analysisHints: "Login page. Should show email/password form and social login options.",
      },
      {
        name: "dashboard",
        path: "/", // redirects to workspace charts after login
        waitFor: 'main, [data-testid="chart-list"], h1',
        analysisHints:
          "Main dashboard / chart list. Shows chart cards with VRTA completion stats. Check card layout and color coding.",
      },
      {
        name: "chart-editor",
        path: "/__FIRST_CHART__", // resolved dynamically in crawl.ts
        waitFor: '[data-testid="chart-editor"], .chart-editor, main',
        analysisHints:
          "Chart editor. VRTA columns should use semantic colors: V=emerald, R=orange, T=sky, A=slate. Check dual-route consistency.",
      },
      {
        name: "workspace-settings",
        path: "/__WORKSPACE__/settings",
        waitFor: 'h1, h2',
        analysisHints: "Workspace settings page. Check member list, role badges, invite flow.",
      },
    ],
    viewports: DEFAULT_VIEWPORTS,
    screenshotDir: "./screenshots",
    timeout: 30000,
  };
}
