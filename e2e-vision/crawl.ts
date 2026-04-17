// e2e-vision/crawl.ts
// Layer 2: Detect — Playwright crawl for screenshots + link checks + console errors
// Usage: npx tsx crawl.ts [--headed] [--pages login,dashboard] [--viewports desktop]

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import * as fs from "fs/promises";
import * as path from "path";
import { loadConfig, type PageConfig, type CrawlConfig } from "./config";

// Load .env.test.local (prefer local, fall back to parent dir shared with Playwright E2E)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: path.resolve(process.cwd(), ".env.test.local") });
dotenvConfig({ path: path.resolve(process.cwd(), "../.env.test.local") });

export interface CrawlResult {
  page: string;
  viewport: string;
  screenshotPath: string;
  status: "ok" | "error";
  error?: string;
  loadTimeMs: number;
  brokenLinks: Array<{ url: string; text: string; status: number }>;
  consoleErrors: string[];
  url: string;
}

export interface CrawlReport {
  timestamp: string;
  baseUrl: string;
  results: CrawlResult[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

async function authenticate(page: Page, config: CrawlConfig): Promise<string> {
  console.log("  Authenticating...");
  await page.goto(`${config.baseUrl}${config.auth.loginPath}`);
  await page.waitForLoadState("networkidle");

  // Login form uses next-intl labels (ja/en) — target by input type/id instead
  await page.locator('input[type="email"]').first().fill(config.auth.email);
  await page.locator('input[type="password"]').first().fill(config.auth.password);
  await page.locator('form button[type="submit"]').first().click();

  await page.waitForURL(config.auth.postLoginWaitUrl, { timeout: config.timeout });
  const currentUrl = page.url();
  console.log(`  Authenticated. Redirected to: ${currentUrl}`);

  // Extract workspace path prefix
  const wsMatch = currentUrl.match(/(\/workspaces\/[a-f0-9-]+)/);
  return wsMatch ? wsMatch[1] : "";
}

async function checkLinks(page: Page): Promise<Array<{ url: string; text: string; status: number }>> {
  const links = await page.$$eval("a[href]", (anchors) =>
    anchors
      .map((a) => ({ url: (a as HTMLAnchorElement).href, text: a.textContent?.trim() || "" }))
      .filter((l) => l.url.startsWith("http"))
  );

  const broken: Array<{ url: string; text: string; status: number }> = [];
  const checked = new Set<string>();

  for (const link of links.slice(0, 20)) {
    if (checked.has(link.url)) continue;
    checked.add(link.url);
    try {
      const resp = await page.request.head(link.url, { timeout: 5000 });
      if (resp.status() >= 400) {
        broken.push({ ...link, status: resp.status() });
      }
    } catch {
      broken.push({ ...link, status: 0 });
    }
  }
  return broken;
}

async function crawlPage(
  page: Page,
  pageConfig: PageConfig,
  viewport: { width: number; height: number; label: string },
  config: CrawlConfig,
  wsPrefix: string
): Promise<CrawlResult> {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  let pagePath = pageConfig.path;
  if (pagePath === "/__FIRST_CHART__") {
    // Find first chart link on dashboard
    const chartLink = await page.$('a[href*="/charts/"]');
    if (chartLink) {
      pagePath = (await chartLink.getAttribute("href")) || pagePath;
    } else {
      return {
        page: pageConfig.name,
        viewport: viewport.label,
        screenshotPath: "",
        status: "error",
        error: "No chart found on dashboard",
        loadTimeMs: 0,
        brokenLinks: [],
        consoleErrors,
        url: "",
      };
    }
  } else if (pagePath.includes("__WORKSPACE__")) {
    pagePath = pagePath.replace("/__WORKSPACE__", wsPrefix);
  }

  const fullUrl = pagePath.startsWith("http") ? pagePath : `${config.baseUrl}${pagePath}`;
  const start = Date.now();

  try {
    await page.goto(fullUrl, { waitUntil: "networkidle", timeout: config.timeout });

    if (pageConfig.waitFor) {
      await page.waitForSelector(pageConfig.waitFor, { timeout: 10000 }).catch(() => {});
    }

    const loadTimeMs = Date.now() - start;

    const screenshotName = `${pageConfig.name}-${viewport.label}.png`;
    const screenshotPath = path.join(config.screenshotDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const brokenLinks = await checkLinks(page);

    return {
      page: pageConfig.name,
      viewport: viewport.label,
      screenshotPath,
      status: "ok",
      loadTimeMs,
      brokenLinks,
      consoleErrors,
      url: fullUrl,
    };
  } catch (e) {
    return {
      page: pageConfig.name,
      viewport: viewport.label,
      screenshotPath: "",
      status: "error",
      error: (e as Error).message,
      loadTimeMs: Date.now() - start,
      brokenLinks: [],
      consoleErrors,
      url: fullUrl,
    };
  }
}

async function main() {
  const flags = parseArgs();
  const config = loadConfig();
  const headed = flags.headed === "true";
  const filterPages = flags.pages?.split(",");
  const filterViewports = flags.viewports?.split(",");

  if (flags.url) config.baseUrl = flags.url;

  const viewports = filterViewports
    ? config.viewports.filter((v) => filterViewports.includes(v.label))
    : config.viewports;

  let pages = config.pages;
  if (filterPages) {
    pages = pages.filter((p) => filterPages.includes(p.name));
  }

  await fs.mkdir(config.screenshotDir, { recursive: true });
  await fs.mkdir("./results", { recursive: true });

  console.log(`\n  ZENSHIN CHART — e2e-vision crawl`);
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  Pages: ${pages.map((p) => p.name).join(", ")}`);
  console.log(`  Viewports: ${viewports.map((v) => v.label).join(", ")}\n`);

  const browser: Browser = await chromium.launch({ headless: !headed });
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const context: BrowserContext = await browser.newContext({
    ...(bypassSecret ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } } : {}),
  });
  const page: Page = await context.newPage();

  // Auth (skip for public-only runs)
  let wsPrefix = "";
  const needsAuth = pages.some((p) => !p.public);
  if (needsAuth) {
    wsPrefix = await authenticate(page, config);
  }

  const results: CrawlResult[] = [];

  for (const pageConfig of pages) {
    for (const viewport of viewports) {
      if (pageConfig.public && filterPages && !filterPages.includes(pageConfig.name)) continue;

      console.log(`  Crawling: ${pageConfig.name} [${viewport.label}]`);
      const result = await crawlPage(page, pageConfig, viewport, config, wsPrefix);
      results.push(result);

      const icon = result.status === "ok" ? "ok" : "FAIL";
      const extras = [];
      if (result.brokenLinks.length > 0) extras.push(`${result.brokenLinks.length} broken links`);
      if (result.consoleErrors.length > 0) extras.push(`${result.consoleErrors.length} console errors`);
      if (result.loadTimeMs > 5000) extras.push(`slow: ${result.loadTimeMs}ms`);
      console.log(`    ${icon} ${result.loadTimeMs}ms ${extras.length ? `(${extras.join(", ")})` : ""}`);
    }
  }

  await browser.close();

  const report: CrawlReport = {
    timestamp: new Date().toISOString(),
    baseUrl: config.baseUrl,
    results,
  };

  const reportPath = `./results/crawl-report-${Date.now()}.json`;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${reportPath}`);

  const errors = results.filter((r) => r.status === "error");
  const broken = results.flatMap((r) => r.brokenLinks);
  const consoleErrs = results.flatMap((r) => r.consoleErrors);

  console.log(`\n  Summary:`);
  console.log(`    Pages crawled: ${results.length}`);
  console.log(`    Errors: ${errors.length}`);
  console.log(`    Broken links: ${broken.length}`);
  console.log(`    Console errors: ${consoleErrs.length}\n`);

  if (errors.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
