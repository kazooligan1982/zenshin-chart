import { NextRequest, NextResponse } from "next/server";
import {
  collectTreeSnapshotData,
  saveTreeSnapshot,
  hasChangedSinceLastTreeSnapshot,
} from "@/lib/tree-snapshot";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 1. Cron シークレットの検証（CRON_SECRET未設定時も401を返す）
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  let savedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  try {
    // 2. 全ワークスペースを取得
    const { data: workspaces } = await supabase.from("workspaces").select("id");

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ success: true, message: "No workspaces found" });
    }

    // 3. 各ワークスペースの全チャートを取得
    for (const workspace of workspaces) {
      const { data: charts } = await supabase
        .from("charts")
        .select("id, title, parent_action_id")
        .is("archived_at", null)
        .eq("workspace_id", workspace.id);

      if (!charts || charts.length === 0) continue;

      // 4. actions テーブルから親子関係マップを構築
      const { data: actions } = await supabase
        .from("actions")
        .select("id, chart_id, child_chart_id");

      const childToParentChartMap = new Map<string, string>();
      for (const action of actions || []) {
        if (action.child_chart_id && action.chart_id) {
          childToParentChartMap.set(action.child_chart_id, action.chart_id);
        }
      }

      // 5. マスターチャート（親がいないチャート）を特定
      const masterCharts = charts.filter(
        (chart: { id: string }) => !childToParentChartMap.has(chart.id)
      );

      // 6. 各マスターチャートについて処理
      for (const master of masterCharts) {
        try {
          const treeData = await collectTreeSnapshotData(
            master.id,
            workspace.id,
            supabase
          );

          const hasChanged = await hasChangedSinceLastTreeSnapshot(
            master.id,
            treeData,
            supabase
          );

          if (!hasChanged) {
            logger.info(`[Tree Snapshot] Skipped (no changes): ${master.title}`);
            skippedCount++;
            continue;
          }

          const snapshotId = await saveTreeSnapshot(
            master.id,
            treeData,
            "auto_daily",
            supabase
          );

          if (snapshotId) {
            logger.info(`[Tree Snapshot] Saved: ${master.title} (${snapshotId})`);
            savedCount++;
          } else {
            errors.push(`Failed to save: ${master.title}`);
          }
        } catch (err) {
          logger.error(`[Tree Snapshot] Error for ${master.title}:`, err);
          errors.push(`Error: ${master.title}`);
          // 1つのチャートのエラーで全体を止めない
          continue;
        }
      }
    }

    return NextResponse.json({
      success: true,
      saved: savedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[Tree Snapshot Cron] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
