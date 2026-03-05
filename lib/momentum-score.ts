/**
 * 前進スコア計算ロジック
 * 朝のサマリーCronやウィークリーレポートで共有して使用
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface MomentumScoreResult {
  score: number;
  details: {
    plusFactors: { label: string; value: number }[];
    minusFactors: { label: string; value: number }[];
    bottlenecks: { actionName: string; blockedCount: number }[];
    overdueActions: { title: string; daysOver: number }[];
  };
}

/**
 * チャート（またはチャートツリー）の前進スコアを計算
 * @param chartId マスターチャートID
 * @param supabase Supabaseクライアント（createServiceRoleClient推奨）
 * @param chartIds ツリー内の全チャートID（省略時は chartId のみ）
 */
export async function calculateMomentumScore(
  chartId: string,
  supabase: SupabaseClient,
  chartIds?: string[]
): Promise<MomentumScoreResult> {
  const targetChartIds = chartIds ?? [chartId];
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString();

  const plusFactors: { label: string; value: number }[] = [];
  const minusFactors: { label: string; value: number }[] = [];
  const bottlenecks: { actionName: string; blockedCount: number }[] = [];
  const overdueActions: { title: string; daysOver: number }[] = [];

  const { data: tensionsData } = await supabase
    .from("tensions")
    .select("id")
    .in("chart_id", targetChartIds);
  const tensionIds = (tensionsData ?? []).map((t: { id: string }) => t.id);

  // --- プラス要素（直近7日間） ---

  // 1. アクション完了: +3（直近7日間にupdated_atがあり、status=done または is_completed=true）
  let actionCompletedCount = 0;
  const { data: updatedLoose } = await supabase
    .from("actions")
    .select("id, status, is_completed")
    .in("chart_id", targetChartIds)
    .is("tension_id", null)
    .gte("updated_at", sevenDaysAgoStr);
  actionCompletedCount += (updatedLoose ?? []).filter(
    (a: { status?: string | null; is_completed?: boolean | null }) =>
      a.status === "done" || a.is_completed === true
  ).length;

  if (tensionIds.length > 0) {
    const { data: updatedTension } = await supabase
      .from("actions")
      .select("id, status, is_completed")
      .in("tension_id", tensionIds)
      .gte("updated_at", sevenDaysAgoStr);
    actionCompletedCount += (updatedTension ?? []).filter(
      (a: { status?: string | null; is_completed?: boolean | null }) =>
        a.status === "done" || a.is_completed === true
    ).length;
  }
  if (actionCompletedCount > 0) {
    plusFactors.push({ label: "アクション完了", value: actionCompletedCount * 3 });
  }

  // 2. Reality更新: +5
  const { data: realityUpdates } = await supabase
    .from("realities")
    .select("id")
    .in("chart_id", targetChartIds)
    .gte("updated_at", sevenDaysAgoStr);
  const realityUpdateCount = (realityUpdates ?? []).length;
  if (realityUpdateCount > 0) {
    plusFactors.push({ label: "Reality更新", value: realityUpdateCount * 5 });
  }

  // 3. Tension解消: +8
  const { data: resolvedTensions } = await supabase
    .from("tensions")
    .select("id")
    .in("chart_id", targetChartIds)
    .eq("status", "resolved")
    .gte("updated_at", sevenDaysAgoStr);
  const tensionResolvedCount = (resolvedTensions ?? []).length;
  if (tensionResolvedCount > 0) {
    plusFactors.push({ label: "Tension解消", value: tensionResolvedCount * 8 });
  }

  // 4. 保留→再開: +2（chart_history から）
  const { data: pendingToProgress } = await supabase
    .from("chart_history")
    .select("id")
    .in("chart_id", targetChartIds)
    .eq("entity_type", "action")
    .eq("event_type", "updated")
    .eq("field", "status")
    .eq("old_value", "pending")
    .eq("new_value", "in_progress")
    .gte("created_at", sevenDaysAgoStr);
  const pendingResumedCount = (pendingToProgress ?? []).length;
  if (pendingResumedCount > 0) {
    plusFactors.push({ label: "保留→再開", value: pendingResumedCount * 2 });
  }

  // --- マイナス要素 ---

  // 期限超過
  const allActionsForOverdue: { id: string; title: string; due_date: string; status?: string; is_completed?: boolean }[] = [];
  const { data: looseOverdue } = await supabase
    .from("actions")
    .select("id, title, due_date, status, is_completed")
    .in("chart_id", targetChartIds)
    .is("tension_id", null)
    .not("due_date", "is", null);
  allActionsForOverdue.push(...(looseOverdue ?? []));

  if (tensionIds.length > 0) {
    const { data: tensionOverdue } = await supabase
      .from("actions")
      .select("id, title, due_date, status, is_completed")
      .in("tension_id", tensionIds)
      .not("due_date", "is", null);
    allActionsForOverdue.push(...(tensionOverdue ?? []));
  }

  const notDoneActions = allActionsForOverdue.filter(
    (a) => a.status !== "done" && a.is_completed !== true
  );

  let overdue1to3 = 0;
  let overdue4to7 = 0;
  let overdue8plus = 0;

  for (const a of notDoneActions) {
    if (!a.due_date) continue;
    const due = new Date(a.due_date);
    const daysOver = Math.floor((Date.now() - due.getTime()) / (24 * 60 * 60 * 1000));
    if (daysOver >= 1) {
      overdueActions.push({ title: a.title || "無題", daysOver });
      if (daysOver >= 8) overdue8plus++;
      else if (daysOver >= 4) overdue4to7++;
      else overdue1to3++;
    }
  }

  if (overdue1to3 > 0) minusFactors.push({ label: "期限超過1〜3日", value: overdue1to3 * -2 });
  if (overdue4to7 > 0) minusFactors.push({ label: "期限超過4〜7日", value: overdue4to7 * -5 });
  if (overdue8plus > 0) minusFactors.push({ label: "期限超過8日以上", value: overdue8plus * -10 });

  // 7日以上更新なし（チャート全体）
  const { data: chartRow } = await supabase.from("charts").select("updated_at").eq("id", chartId).single();
  const chartUpdatedAt = chartRow?.updated_at ? new Date(chartRow.updated_at).getTime() : 0;
  if (chartUpdatedAt < sevenDaysAgo.getTime()) {
    minusFactors.push({ label: "7日以上更新なし", value: -8 });
  }

  // 担当者未設定のアクション: -3（完了以外で担当者が空）
  const allForUnassigned = [
    ...((await supabase.from("actions").select("id, assignee, status, is_completed").in("chart_id", targetChartIds).is("tension_id", null)).data ?? []),
    ...(tensionIds.length > 0
      ? ((await supabase.from("actions").select("id, assignee, status, is_completed").in("tension_id", tensionIds)).data ?? [])
      : []),
  ];
  const unassignedCount = allForUnassigned.filter(
    (a: { status?: string | null; is_completed?: boolean | null; assignee?: string | null }) =>
      a.status !== "done" &&
      a.is_completed !== true &&
      (!a.assignee || String(a.assignee).trim() === "")
  ).length;
  if (unassignedCount > 0) {
    minusFactors.push({ label: "担当者未設定", value: unassignedCount * -3 });
  }

  // 保留ステータス: -1（件数分）
  let pendingCount = 0;
  const { data: pendingLoose } = await supabase
    .from("actions")
    .select("id")
    .in("chart_id", targetChartIds)
    .is("tension_id", null)
    .eq("status", "pending");
  pendingCount += (pendingLoose ?? []).length;

  if (tensionIds.length > 0) {
    const { data: pendingTension } = await supabase
      .from("actions")
      .select("id")
      .in("tension_id", tensionIds)
      .eq("status", "pending");
    pendingCount += (pendingTension ?? []).length;
  }
  if (pendingCount > 0) {
    minusFactors.push({ label: "保留ステータス", value: pendingCount * -1 });
  }

  // ボトルネック（blocking_action がブロックしている件数）
  const { data: deps } = await supabase
    .from("action_dependencies")
    .select("blocking_action_id")
    .in("chart_id", targetChartIds);

  if (deps && deps.length > 0) {
    const blockerCounts = new Map<string, number>();
    for (const d of deps) {
      const bid = (d as { blocking_action_id: string }).blocking_action_id;
      blockerCounts.set(bid, (blockerCounts.get(bid) ?? 0) + 1);
    }
    const blockerIds = [...blockerCounts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    if (blockerIds.length > 0) {
      const { data: blockerActions } = await supabase
        .from("actions")
        .select("id, title")
        .in("id", blockerIds);
      for (const a of blockerActions ?? []) {
        const count = blockerCounts.get(a.id) ?? 0;
        bottlenecks.push({ actionName: a.title || "無題", blockedCount: count });
      }
    }
  }

  const plusTotal = plusFactors.reduce((s, f) => s + f.value, 0);
  const minusTotal = minusFactors.reduce((s, f) => s + f.value, 0);
  const score = Math.max(0, plusTotal + minusTotal);

  return {
    score,
    details: {
      plusFactors,
      minusFactors,
      bottlenecks,
      overdueActions: overdueActions.sort((a, b) => b.daysOver - a.daysOver).slice(0, 10),
    },
  };
}
