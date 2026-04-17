// e2e-vision/analyze.ts
// Layer 2-3: Detect + Triage — Claude Vision API analysis of crawl screenshots
// Usage: npx tsx analyze.ts [--report ./results/crawl-report-xxx.json]

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs/promises";
import * as path from "path";

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: path.resolve(process.cwd(), ".env.test.local") });
dotenvConfig({ path: path.resolve(process.cwd(), "../.env.test.local") });
dotenvConfig({ path: path.resolve(process.cwd(), "../.env.local") });

export interface UIIssue {
  severity: "critical" | "warning" | "info";
  category: "broken-layout" | "visual-regression" | "accessibility" | "ux-issue" | "performance" | "broken-link" | "console-error";
  description: string;
  suggestion: string;
  filePath?: string;
}

export interface PageAnalysis {
  page: string;
  viewport: string;
  issues: UIIssue[];
  overallScore: number;
  summary: string;
  screenshotPath: string;
}

export interface AnalysisReport {
  timestamp: string;
  analyses: PageAnalysis[];
  totalIssues: number;
  criticalCount: number;
  averageScore: number;
}

const SYSTEM_PROMPT = `You are a senior UI/UX engineer reviewing screenshots of ZENSHIN CHART, a structural consulting SaaS.

ZENSHIN CHART uses Robert Fritz's VRTA framework:
- Vision (V) = emerald green (#10B981)
- Reality (R) = orange (#F97316)
- Tension (T) = sky blue (#0EA5E9)
- Action (A) = slate gray (#64748B)

CRITICAL: The app has dual routes. /charts/[id] and /workspaces/[wsId]/charts/[id] must render identically.

Respond ONLY with valid JSON:
{
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "broken-layout" | "visual-regression" | "accessibility" | "ux-issue" | "performance",
      "description": "What is wrong",
      "suggestion": "How to fix it",
      "filePath": "Likely file path (e.g. app/charts/[id]/page.tsx)"
    }
  ],
  "overallScore": 85,
  "summary": "One-line summary"
}

Scoring: 90-100 production ready, 70-89 minor issues, 50-69 notable problems, 0-49 critical.

Check for:
1. Layout breaks (overlapping, misaligned, overflow)
2. VRTA color consistency (emerald/orange/sky/slate)
3. Missing content (blank areas, broken images)
4. Responsive issues (too small/large for viewport)
5. Text readability (contrast, truncation)
6. Interactive elements clearly identifiable
7. Loading states stuck
8. Error boundaries visible on wrong pages`;

async function analyzeScreenshot(
  client: Anthropic,
  screenshotPath: string,
  pageName: string,
  viewport: string,
  hints?: string,
  consoleErrors?: string[],
  brokenLinks?: Array<{ url: string; text: string }>
): Promise<{ issues: UIIssue[]; overallScore: number; summary: string }> {
  const imageBuffer = await fs.readFile(screenshotPath);
  const base64 = imageBuffer.toString("base64");

  let userPrompt = `Analyze this screenshot of "${pageName}" at ${viewport} viewport.\n`;
  if (hints) userPrompt += `\nContext: ${hints}\n`;
  if (consoleErrors?.length) userPrompt += `\nConsole errors:\n${consoleErrors.map((e) => `- ${e}`).join("\n")}\n`;
  if (brokenLinks?.length) userPrompt += `\nBroken links:\n${brokenLinks.map((l) => `- "${l.text}" -> ${l.url}`).join("\n")}\n`;
  userPrompt += "\nRespond with JSON only.";

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      issues: parsed.issues || [],
      overallScore: parsed.overallScore ?? 50,
      summary: parsed.summary || "No summary",
    };
  } catch (e) {
    console.error(`  Vision API error for ${pageName}[${viewport}]:`, (e as Error).message);
    return {
      issues: [{ severity: "warning", category: "broken-layout", description: `Vision API failed: ${(e as Error).message}`, suggestion: "Re-run or check API key" }],
      overallScore: 0,
      summary: "Analysis failed",
    };
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  // Find latest crawl report
  const args = process.argv.slice(2);
  let reportPath = args.find((a) => a.endsWith(".json"));
  if (!reportPath) {
    const files = await fs.readdir("./results");
    const crawlReports = files.filter((f) => f.startsWith("crawl-report-")).sort().reverse();
    if (crawlReports.length === 0) throw new Error("No crawl report found. Run crawl.ts first.");
    reportPath = `./results/${crawlReports[0]}`;
  }

  console.log(`\n  Analyzing: ${reportPath}`);
  const crawlReport = JSON.parse(await fs.readFile(reportPath, "utf-8"));
  const analyses: PageAnalysis[] = [];

  for (const result of crawlReport.results) {
    if (result.status === "error" || !result.screenshotPath) {
      analyses.push({
        page: result.page, viewport: result.viewport,
        issues: [{ severity: "critical", category: "broken-layout", description: `Page failed: ${result.error}`, suggestion: "Check route exists" }],
        overallScore: 0, summary: "Page load failed", screenshotPath: "",
      });
      continue;
    }

    console.log(`  Analyzing: ${result.page} [${result.viewport}]`);
    const { issues, overallScore, summary } = await analyzeScreenshot(
      client, result.screenshotPath, result.page, result.viewport,
      undefined, result.consoleErrors, result.brokenLinks
    );

    // Add crawl-detected issues
    for (const link of result.brokenLinks) {
      issues.push({ severity: "critical", category: "broken-link", description: `Broken: "${link.text}" -> ${link.url} (${link.status})`, suggestion: "Fix href or remove link" });
    }
    for (const err of result.consoleErrors) {
      issues.push({ severity: err.includes("TypeError") ? "critical" : "warning", category: "console-error", description: err, suggestion: "Fix JS error" });
    }
    if (result.loadTimeMs > 5000) {
      issues.push({ severity: "warning", category: "performance", description: `Load time: ${result.loadTimeMs}ms`, suggestion: "Investigate slow API calls" });
    }

    analyses.push({ page: result.page, viewport: result.viewport, issues, overallScore, summary, screenshotPath: result.screenshotPath });
    console.log(`    Score: ${overallScore}/100 | Issues: ${issues.length} | ${summary}`);
  }

  const report: AnalysisReport = {
    timestamp: new Date().toISOString(),
    analyses,
    totalIssues: analyses.reduce((s, a) => s + a.issues.length, 0),
    criticalCount: analyses.reduce((s, a) => s + a.issues.filter((i) => i.severity === "critical").length, 0),
    averageScore: Math.round(analyses.reduce((s, a) => s + a.overallScore, 0) / (analyses.length || 1)),
  };

  const outPath = `./results/analysis-report-${Date.now()}.json`;
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  console.log(`\n  Report: ${outPath}`);
  console.log(`  Total issues: ${report.totalIssues} (${report.criticalCount} critical)`);
  console.log(`  Average score: ${report.averageScore}/100\n`);

  if (report.criticalCount > 0) {
    console.log("  CRITICAL issues found. Exiting with code 1.");
    process.exit(1);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
