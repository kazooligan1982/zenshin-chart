import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://zenshin-web-alpha.vercel.app";

  if (!webhookUrl) {
    console.error("[Slack Summary] SLACK_WEBHOOK_URL is not set");
    return NextResponse.json({ error: "SLACK_WEBHOOK_URL not configured" }, { status: 500 });
  }

  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().split("T")[0];

  try {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("slack_notify", true);

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ success: true, message: "No workspaces found" });
    }

    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "📊 ZENSHIN CHART 朝のサマリー", emoji: true },
      },
    ];

    for (const ws of workspaces) {
      const wsName = ws.name || "ワークスペース";
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${wsName}*` },
      });

      const { data: charts } = await supabase
        .from("charts")
        .select("id, title")
        .eq("workspace_id", ws.id)
        .is("archived_at", null)
        .order("title");

      if (!charts || charts.length === 0) {
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: "_チャートがありません_" }],
        });
        continue;
      }

      for (const chart of charts) {
        const [visionsRes, realitiesRes, tensionsRes, tensionsDataRes] = await Promise.all([
          supabase.from("visions").select("id", { count: "exact", head: true }).eq("chart_id", chart.id),
          supabase.from("realities").select("id", { count: "exact", head: true }).eq("chart_id", chart.id),
          supabase.from("tensions").select("id", { count: "exact", head: true }).eq("chart_id", chart.id),
          supabase.from("tensions").select("id").eq("chart_id", chart.id),
        ]);

        const vCount = visionsRes.count ?? 0;
        const rCount = realitiesRes.count ?? 0;
        const tCount = tensionsRes.count ?? 0;

        const tensionIds = (tensionsDataRes.data || []).map((t: { id: string }) => t.id);
        let aCount = 0;
        if (tensionIds.length > 0) {
          const { count: tensionActionsCount } = await supabase
            .from("actions")
            .select("id", { count: "exact", head: true })
            .in("tension_id", tensionIds);
          aCount += tensionActionsCount ?? 0;
        }
        const { count: looseActionsCount } = await supabase
          .from("actions")
          .select("id", { count: "exact", head: true })
          .eq("chart_id", chart.id)
          .is("tension_id", null);
        aCount += looseActionsCount ?? 0;

        const chartTitle = (chart.title || "無題").replace(/[&<>]/g, (c: string) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c)
        );

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🌿 *${chartTitle}*\n  V: ${vCount}  R: ${rCount}  T: ${tCount}  A: ${aCount}`,
          },
        });

        const overdueActions: { title: string; daysOver: number }[] = [];
        if (tensionIds.length > 0) {
          const { data: tensionActionsRaw } = await supabase
            .from("actions")
            .select("id, title, due_date, status, is_completed")
            .in("tension_id", tensionIds)
            .lt("due_date", today);
          const tensionActions = (tensionActionsRaw || []).filter(
            (a: { status?: string | null; is_completed?: boolean | null }) => {
              const done = a.status === "done" || a.is_completed === true;
              return !done;
            }
          );
          for (const a of tensionActions) {
            if (a.due_date) {
              const due = new Date(a.due_date);
              const daysOver = Math.floor((Date.now() - due.getTime()) / (24 * 60 * 60 * 1000));
              overdueActions.push({
                title: (a.title || "無題").replace(/[&<>]/g, (c: string) =>
                  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c)
                ),
                daysOver,
              });
            }
          }
        }
        const { data: looseOverdueRaw } = await supabase
          .from("actions")
          .select("id, title, due_date, status, is_completed")
          .eq("chart_id", chart.id)
          .is("tension_id", null)
          .lt("due_date", today);
        const looseOverdue = (looseOverdueRaw || []).filter(
          (a: { status?: string | null; is_completed?: boolean | null }) => {
            const done = a.status === "done" || a.is_completed === true;
            return !done;
          }
        );
        for (const a of looseOverdue) {
          if (a.due_date) {
            const due = new Date(a.due_date);
            const daysOver = Math.floor((Date.now() - due.getTime()) / (24 * 60 * 60 * 1000));
            overdueActions.push({
              title: (a.title || "無題").replace(/[&<>]/g, (c: string) =>
                ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c)
              ),
              daysOver,
            });
          }
        }

        if (overdueActions.length > 0) {
          const items = overdueActions
            .map((o) => `  • ${o.title}（${o.daysOver}日超過）`)
            .join("\n");
          blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `⚠️ *停滞中のアクション（期限超過）*\n${items}` },
          });
        }

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `👉 <${appUrl}/workspaces/${ws.id}/charts/${chart.id}|チャートを確認する>`,
          },
        });
      }

      blocks.push({ type: "divider" });
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "ZENSHIN CHART 朝のサマリー",
        blocks: blocks.slice(0, 50),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Slack Summary] Slack API error:", res.status, errText);
      return NextResponse.json(
        { error: "Slack API error", status: res.status, body: errText },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      workspaces: workspaces.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Slack Summary] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
