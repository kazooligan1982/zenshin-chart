import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AI_MODEL, AI_MAX_TOKENS } from "@/lib/ai-config";
import { calculateMomentumScore } from "@/lib/momentum-score";
import { collectTreeSnapshotData } from "@/lib/tree-snapshot";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WEEKLY_AI_SYSTEM_PROMPT = `あなたはRobert Fritzの構造ダイナミクスに基づくコーチです。

以下のルールに従ってください：
- 必ず Vision → Reality → Tension → Action の順で思考する
- 直接的な答えではなく「問いかけ」を中心にする
- 構造的テンションに焦点を当てる（「VisionとRealityのギャップは何か？」）
- 3文以内で簡潔に
- 日本語で出力

以下のワークスペースの今週の活動データを見て、チームへの問いかけを3文以内で生成してください。
問いかけはVisionに向かう構造的テンションに焦点を当ててください。`;

const AI_INSIGHT_FALLBACK = "今週のVisionとRealityのギャップに、どんな問いを投げかけますか？";

function getMondayOfWeek(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
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
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("slack_notify", true);

    if (workspacesError) {
      logger.error("[Slack Weekly] Supabase workspaces error:", workspacesError);
      return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
    }
    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ success: true, message: "No workspaces with Slack notify" });
    }

    const { data: actions, error: actionsError } = await supabase
      .from("actions")
      .select("id, chart_id, child_chart_id");
    if (actionsError) {
      logger.error("[Slack Weekly] Supabase actions error:", actionsError);
    }
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

    const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const ws of workspaces) {
      const { data: charts, error: chartsError } = await supabase
        .from("charts")
        .select("id, title")
        .eq("workspace_id", ws.id)
        .is("archived_at", null);

      if (chartsError) {
        logger.error("[Slack Weekly] Supabase charts error for workspace", chartsError, { workspaceId: logger.hashId(ws.id) });
        continue;
      }
      if (!charts || charts.length === 0) continue;

      const masterCharts = charts.filter((c: { id: string }) => !childToParent.has(c.id));

      for (const master of masterCharts) {
        try {
          const treeData = await collectTreeSnapshotData(master.id, ws.id, supabase);
          const chartIds = treeData.charts.map((c: { chart_id: string }) => c.chart_id);

          const momentum = await calculateMomentumScore(master.id, supabase, chartIds);

          let staleChartsCount = 0;
          if (chartIds.length > 0) {
            const { data: staleCharts } = await supabase
              .from("charts")
              .select("id")
              .in("id", chartIds)
              .lt("updated_at", sevenDaysAgoStr);
            staleChartsCount = staleCharts?.length ?? 0;
          }

          const { data: lastWeekScore, error: lastWeekError } = await supabase
            .from("momentum_scores")
            .select("score")
            .eq("chart_id", master.id)
            .eq("week_start", lastWeekStart)
            .maybeSingle();

          if (lastWeekError) {
            logger.error("[Slack Weekly] Supabase momentum_scores error:", lastWeekError);
          }
          const prevScore = lastWeekScore?.score ?? null;
          const diffStr = prevScore !== null ? (momentum.score - prevScore >= 0 ? `+${momentum.score - prevScore}` : `${momentum.score - prevScore}`) : "—";

          const { data: snapshots, error: snapshotsError } = await supabase
            .from("snapshots")
            .select("id, created_at, data")
            .eq("chart_id", master.id)
            .order("created_at", { ascending: false })
            .limit(2);

          if (snapshotsError) {
            logger.error("[Slack Weekly] Supabase snapshots error:", snapshotsError);
          }

          let aiInsight = "（スナップショットが不足しているためAI分析はスキップしました）";
          const beforeData = snapshots?.[1]?.data as Record<string, unknown> | undefined;
          const afterData = snapshots?.[0]?.data as Record<string, unknown> | undefined;

          const realityCount = momentum.details.plusFactors.find((f) => f.label === "Reality更新")?.value
            ? Math.abs(momentum.details.plusFactors.find((f) => f.label === "Reality更新")!.value) / 5
            : 0;
          const actionDoneCount = momentum.details.plusFactors.find((f) => f.label === "アクション完了")?.value
            ? Math.abs(momentum.details.plusFactors.find((f) => f.label === "アクション完了")!.value) / 3
            : 0;
          const tensionResolvedCount = momentum.details.plusFactors.find((f) => f.label === "Tension解消")?.value
            ? Math.abs(momentum.details.plusFactors.find((f) => f.label === "Tension解消")!.value) / 8
            : 0;

          if (beforeData && afterData && snapshots && snapshots.length >= 2) {
            const userContent = [
              "## 今週の活動データ",
              `- 完了アクション数: ${actionDoneCount}`,
              `- Reality更新数: ${realityCount}`,
              `- Tension解消数: ${tensionResolvedCount}`,
              `- 期限超過アクション数: ${momentum.details.overdueActions.length}`,
              `- 停滞チャート数（7日以上更新なし）: ${staleChartsCount}`,
              "",
              "## チャート概要（Vision・Reality・Tension）",
              JSON.stringify(
                treeData.charts.map((c) => {
                  const visions = (c.visions ?? []) as Array<{ content?: string }>;
                  const realities = (c.realities ?? []) as Array<{ content?: string }>;
                  const tensions = (c.tensions ?? []) as Array<{ title?: string; status?: string }>;
                  return {
                    title: c.title,
                    visions: visions.map((v) => v.content),
                    realities: realities.map((r) => r.content),
                    tensions: tensions.map((t) => ({ title: t.title, status: t.status })),
                  };
                }),
                null,
                2
              ),
            ].join("\n");

            try {
              const msg = await anthropic.messages.create({
                model: AI_MODEL.LIGHT,
                max_tokens: AI_MAX_TOKENS.slack_weekly,
                system: WEEKLY_AI_SYSTEM_PROMPT,
                messages: [{ role: "user", content: userContent }],
              });
              const textBlock = msg.content[0];
              if (textBlock.type === "text") {
                aiInsight = textBlock.text.replace(/\*\*(.*?)\*\*/g, "$1").trim();
                if (!aiInsight) aiInsight = AI_INSIGHT_FALLBACK;
              }
            } catch (aiErr) {
              logger.error("[Slack Weekly] AI insight generation failed:", aiErr);
              aiInsight = AI_INSIGHT_FALLBACK;
            }
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

          const overdueList = momentum.details.overdueActions
            .slice(0, 3)
            .map(
              (o) =>
                `${(o.title || "無題").replace(/[&<>]/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c))}（${o.daysOver}日超過）`
            );

          const chartTitle = (master.title || "無題").replace(/[&<>]/g, (c: string) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c)
          );
          const dashboardUrl = `${appUrl.replace(/\/$/, "")}/workspaces/${ws.id}/charts/${master.id}/dashboard`;

          blocks.push({
            type: "header",
            text: { type: "plain_text", text: chartTitle, emoji: true },
          });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚀 *前進スコア:* ${momentum.score} （先週比 ${diffStr}）`,
            },
          });
          blocks.push({ type: "divider" });
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
              text: `🤖 *AIインサイト*\n_${aiInsight.replace(/_/g, "\\_")}_`,
            },
          });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `👉 <${dashboardUrl}|ダッシュボードで詳細を見る>`,
            },
          });
          blocks.push({ type: "divider" });
        } catch (err) {
          logger.error(`[Slack Weekly] Error for chart ${master.title}:`, err);
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
      logger.error("[Slack Weekly] Slack API error", undefined, { status: res.status, body: errText });
      return NextResponse.json({ error: "Slack API error", status: res.status }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      workspaces: workspaces.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[Slack Weekly] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
