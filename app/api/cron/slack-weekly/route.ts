import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculateMomentumScore } from "@/lib/momentum-score";
import { collectTreeSnapshotData } from "@/lib/tree-snapshot";

export const dynamic = "force-dynamic";

const WEEKLY_AI_SYSTEM_PROMPT = `あなたはFritzの構造的緊張理論に基づくコーチです。
以下のチャートデータを分析し、3文以内で：
1. Visionに向かって前進しているか
2. 最も重要なボトルネック
3. 今週注力すべきこと
を端的に伝えてください。`;

function getMondayOfWeek(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function extractItemsByCategory(data: Record<string, unknown>, category: string): unknown[] {
  if (!data) return [];
  const direct = (data as Record<string, unknown>)[category];
  if (Array.isArray(direct)) return direct;
  const charts = (data as Record<string, unknown>).charts;
  if (Array.isArray(charts)) {
    return charts.flatMap((c: unknown) =>
      ((c as Record<string, unknown>)[category] as unknown[] || []).map((item: unknown) => ({
        ...(item as object),
        _chartId: (c as Record<string, unknown>).chart_id,
      }))
    );
  }
  return [];
}

function computeDiff(
  beforeData: Record<string, unknown>,
  afterData: Record<string, unknown>
): { added: unknown[]; modified: unknown[]; removed: unknown[] } {
  const added: unknown[] = [];
  const modified: unknown[] = [];
  const removed: unknown[] = [];

  for (const category of ["visions", "realities", "tensions", "actions"]) {
    const items1 = extractItemsByCategory(beforeData, category);
    const items2 = extractItemsByCategory(afterData, category);

    for (const item2 of items2) {
      const id2 = (item2 as Record<string, unknown>).id;
      const found = items1.find((i) => (i as Record<string, unknown>).id === id2);
      if (!found) {
        added.push({ type: category, ...(item2 as object) });
      } else if (JSON.stringify(found) !== JSON.stringify(item2)) {
        modified.push({ type: category, before: found, after: item2 });
      }
    }
    for (const item1 of items1) {
      const id1 = (item1 as Record<string, unknown>).id;
      if (!items2.find((i) => (i as Record<string, unknown>).id === id1)) {
        removed.push({ type: category, ...(item1 as object) });
      }
    }
  }
  return { added, modified, removed };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://zenshin-web-alpha.vercel.app";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!webhookUrl) {
    return NextResponse.json({ error: "SLACK_WEBHOOK_URL not configured" }, { status: 500 });
  }
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = createServiceRoleClient();
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const thisWeekStart = getMondayOfWeek(new Date());
  const lastWeekStart = getMondayOfWeek(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  try {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("slack_notify", true);

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ success: true, message: "No workspaces with Slack notify" });
    }

    const { data: actions } = await supabase
      .from("actions")
      .select("id, chart_id, child_chart_id");
    const childToParent = new Map<string, string>();
    for (const a of actions || []) {
      if (a.child_chart_id && a.chart_id) childToParent.set(a.child_chart_id, a.chart_id);
    }

    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "📊 ZENSHIN CHART ウィークリーレポート", emoji: true },
      },
      { type: "divider" },
    ];

    for (const ws of workspaces) {
      const { data: charts } = await supabase
        .from("charts")
        .select("id, title")
        .eq("workspace_id", ws.id)
        .is("archived_at", null);

      if (!charts || charts.length === 0) continue;

      const masterCharts = charts.filter((c: { id: string }) => !childToParent.has(c.id));

      for (const master of masterCharts) {
        try {
          const treeData = await collectTreeSnapshotData(master.id, ws.id, supabase);
          const chartIds = treeData.charts.map((c: { chart_id: string }) => c.chart_id);

          const momentum = await calculateMomentumScore(master.id, supabase, chartIds);

          const { data: lastWeekScore } = await supabase
            .from("momentum_scores")
            .select("score")
            .eq("chart_id", master.id)
            .eq("week_start", lastWeekStart)
            .maybeSingle();

          const prevScore = lastWeekScore?.score ?? null;
          const diffStr = prevScore !== null ? (momentum.score - prevScore >= 0 ? `+${momentum.score - prevScore}` : `${momentum.score - prevScore}`) : "—";

          const { data: snapshots } = await supabase
            .from("snapshots")
            .select("id, created_at, data")
            .eq("chart_id", master.id)
            .order("created_at", { ascending: false })
            .limit(2);

          let aiInsight = "（スナップショットが不足しているためAI分析はスキップしました）";
          const beforeData = snapshots?.[1]?.data as Record<string, unknown> | undefined;
          const afterData = snapshots?.[0]?.data as Record<string, unknown> | undefined;

          if (beforeData && afterData && snapshots && snapshots.length >= 2) {
            const diff = computeDiff(beforeData, afterData);
            const summary = {
              addedCount: diff.added.length,
              modifiedCount: diff.modified.length,
              removedCount: diff.removed.length,
            };

            const chartsForAi = treeData.charts.map((c) => {
              const visions = (c.visions ?? []) as Array<{ content?: string }>;
              const realities = (c.realities ?? []) as Array<{ content?: string }>;
              const tensions = (c.tensions ?? []) as Array<{ title?: string; status?: string }>;
              return {
                title: c.title,
                visions: visions.map((v) => v.content),
                realities: realities.map((r) => r.content),
                tensions: tensions.map((t) => ({ title: t.title, status: t.status })),
              };
            });
            const userContent = [
              "## チャートデータ（Vision・Reality・Tension）",
              JSON.stringify({ charts: chartsForAi }, null, 2),
              "\n## 直近7日間のアクションステータス変化",
              `追加: ${summary.addedCount}, 変更: ${summary.modifiedCount}, 削除: ${summary.removedCount}`,
              "\n## 前進スコア内訳",
              "プラス:", JSON.stringify(momentum.details.plusFactors),
              "マイナス:", JSON.stringify(momentum.details.minusFactors),
              "ボトルネック:", JSON.stringify(momentum.details.bottlenecks),
            ].join("\n");

            const msg = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 500,
              system: WEEKLY_AI_SYSTEM_PROMPT,
              messages: [{ role: "user", content: userContent }],
            });
            const textBlock = msg.content[0];
            if (textBlock.type === "text") aiInsight = textBlock.text.replace(/\*\*(.*?)\*\*/g, "$1");
          }

          await supabase
            .from("momentum_scores")
            .upsert(
              {
                chart_id: master.id,
                workspace_id: ws.id,
                score: momentum.score,
                week_start: thisWeekStart,
                ai_insight: aiInsight,
              },
              { onConflict: "chart_id,week_start" }
            );

          const realityCount = momentum.details.plusFactors.find((f) => f.label === "Reality更新")?.value
            ? Math.abs(momentum.details.plusFactors.find((f) => f.label === "Reality更新")!.value) / 5
            : 0;
          const actionDoneCount = momentum.details.plusFactors.find((f) => f.label === "アクション完了")?.value
            ? Math.abs(momentum.details.plusFactors.find((f) => f.label === "アクション完了")!.value) / 3
            : 0;
          const tensionResolvedCount = momentum.details.plusFactors.find((f) => f.label === "Tension解消")?.value
            ? Math.abs(momentum.details.plusFactors.find((f) => f.label === "Tension解消")!.value) / 8
            : 0;

          const overdueList = momentum.details.overdueActions
            .slice(0, 3)
            .map(
              (o) =>
                `${(o.title || "無題").replace(/[&<>]/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c))}（${o.daysOver}日超過）`
            );

          const chartTitle = (master.title || "無題").replace(/[&<>]/g, (c: string) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c)
          );

          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${chartTitle}*`,
            },
          });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚀 *前進スコア:* ${momentum.score} （先週比 ${diffStr}）`,
            },
          });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✨ *今週の前進*\n• Reality ${realityCount}件更新\n• アクション ${actionDoneCount}件完了\n• Tension ${tensionResolvedCount}件解消`,
            },
          });
          if (overdueList.length > 0) {
            blocks.push({
              type: "section",
              text: {
                type: "mrkdwn",
                text: `⚡ *今すぐ動くべきこと*\n• ${overdueList.join("\n• ")}`,
              },
            });
          }
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🤖 *AIインサイト*\n${aiInsight}`,
            },
          });
          const dashboardUrl = `${appUrl.replace(/\/$/, "")}/workspaces/${ws.id}/charts/${master.id}/dashboard`;
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `👉 <${dashboardUrl}|ダッシュボードで詳細を見る>`,
            },
          });
          blocks.push({ type: "divider" });
        } catch (err) {
          console.error(`[Slack Weekly] Error for chart ${master.title}:`, err);
        }
      }
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "ZENSHIN CHART ウィークリーレポート",
        blocks: blocks.slice(0, 50),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Slack Weekly] Slack API error:", res.status, errText);
      return NextResponse.json({ error: "Slack API error", status: res.status }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      workspaces: workspaces.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Slack Weekly] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
