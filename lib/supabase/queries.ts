import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { logger } from "@/lib/logger";
import type {
  Chart,
  ChartStatus,
  VisionItem,
  RealityItem,
  Tension,
  ActionPlan,
  Area,
  HistoryItem,
} from "@/types/chart";

// Chart取得（関連データを含む）
export async function getChartById(chartId: string): Promise<Chart | null> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: { user: _user } } = await supabase.auth.getUser();

    // Chart基本情報を取得
    const { data: chart, error: chartError } = await supabase
      .from("charts")
      .select("*")
      .eq("id", chartId)
      .single();

    if (chartError) {
      logger.error("[getChartById] Supabase error", chartError, {
        chartIdHash: logger.hashId(chartId),
      });
      return null;
    }

    if (!chart) {
      logger.warn("[getChartById] Chart not found", {
        chartIdHash: logger.hashId(chartId),
      });
      return null;
    }
    // 並列クエリ: Visions, Realities, Tensions, Areas, Actionsを同時に取得
    const [
      { data: visions, error: visionsError },
      { data: realities, error: realitiesError },
      { data: tensions, error: tensionsError },
      { data: areas, error: areasError },
      { data: actions },
    ] = await Promise.all([
      supabase
        .from("visions")
        .select("*, vision_comments(count)")
        .eq("chart_id", chartId)
        .order("target_date", { ascending: false, nullsFirst: true })
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("realities")
        .select("*, reality_comments(count)")
        .eq("chart_id", chartId)
        .order("created_at", { ascending: true }),
      supabase
        .from("tensions")
        .select("*")
        .eq("chart_id", chartId)
        .order("created_at", { ascending: true }),
      supabase
        .from("areas")
        .select("*")
        .eq("chart_id", chartId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("actions")
        .select("*, action_comments(count)")
        .eq("chart_id", chartId)
        .order("created_at", { ascending: true }),
    ]);

    if (visionsError) logger.error("[getChartById] fetching visions failed", visionsError);
    if (realitiesError) logger.error("[getChartById] fetching realities failed", realitiesError);
    if (tensionsError) logger.error("[getChartById] fetching tensions failed", tensionsError);
    if (areasError) logger.error("[getChartById] fetching areas failed", areasError);

    // Tension関係を並列取得
    const tensionIds = tensions?.map((t: { id: string }) => t.id) || [];
    const [{ data: tensionVisions }, { data: tensionRealities }] =
      await Promise.all([
        supabase
          .from("tension_visions")
          .select("*")
          .in("tension_id", tensionIds.length > 0 ? tensionIds : ["__none__"]),
        supabase
          .from("tension_realities")
          .select("*")
          .in("tension_id", tensionIds.length > 0 ? tensionIds : ["__none__"]),
      ]);

    // データを整形
    const visionMap = new Map(
      (visions || []).map((v: { id: string; content: string; created_at: string; updated_at: string; assignee: string | null; due_date: string | null; target_date: string | null; is_locked: boolean | null; area_id: string | null; vision_comments: { count: number }[]; description: string | null }) => [
        v.id,
        {
          id: v.id,
          content: v.content,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
          assignee: v.assignee || undefined,
          dueDate: v.due_date || undefined,
          targetDate: v.target_date || undefined,
          isLocked: v.is_locked || false,
          area_id: v.area_id || null,
          comment_count: v.vision_comments?.[0]?.count ?? 0,
          description: v.description || "",
        } as VisionItem,
      ])
    );

    const realityMap = new Map(
      (realities || []).map((r: { id: string; content: string; created_at: string; due_date: string | null; related_vision_id: string | null; area_id: string | null; is_locked: boolean | null; created_by: string | null; reality_comments: { count: number }[]; description: string | null }) => [
        r.id,
        {
          id: r.id,
          content: r.content,
          createdAt: r.created_at,
          dueDate: r.due_date || undefined,
          relatedVisionId: r.related_vision_id || undefined,
          area_id: r.area_id || null,
          isLocked: r.is_locked || false,
          created_by: r.created_by || null,
          comment_count: r.reality_comments?.[0]?.count ?? 0,
          description: r.description || "",
        } as RealityItem,
      ])
    );

    const actionMap = new Map<string, ActionPlan[]>();
    const looseActions: ActionPlan[] = [];
    (actions || []).forEach((a: { id: string; title: string; due_date: string | null; assignee: string | null; status: string | null; has_sub_chart: boolean | null; sub_chart_id: string | null; child_chart_id: string | null; is_completed: boolean | null; description: string | null; area_id: string | null; action_comments: { count: number }[]; tension_id: string | null }) => {
      const action: ActionPlan = {
        id: a.id,
        title: a.title,
        dueDate: a.due_date || undefined,
        assignee: a.assignee || undefined,
        status: a.status as ActionPlan["status"] || null,
        hasSubChart: !!(a.has_sub_chart || a.child_chart_id), // child_chart_idがあればhasSubChartもtrue
        subChartId: a.sub_chart_id || undefined,
        childChartId: a.child_chart_id || undefined,
        isCompleted: a.is_completed || false,
        description: a.description || undefined,
        area_id: a.area_id || null,
        comment_count: a.action_comments?.[0]?.count ?? 0,
      };
      if (a.tension_id) {
        if (!actionMap.has(a.tension_id)) {
          actionMap.set(a.tension_id, []);
        }
        actionMap.get(a.tension_id)!.push(action);
      } else {
        looseActions.push(action);
      }
    });

    const tensionsWithRelations: Tension[] = (tensions || []).map((t: { id: string; title: string; description: string | null; status: string; area_id: string | null }) => {
      const visionIds =
        tensionVisions
          ?.filter((tv: { tension_id: string; vision_id: string }) => tv.tension_id === t.id)
          .map((tv: { tension_id: string; vision_id: string }) => tv.vision_id) || [];
      const realityIds =
        tensionRealities
          ?.filter((tr: { tension_id: string; reality_id: string }) => tr.tension_id === t.id)
          .map((tr: { tension_id: string; reality_id: string }) => tr.reality_id) || [];

      return {
        id: t.id,
        title: t.title,
        description: t.description || undefined,
        status: t.status as "active" | "review_needed" | "resolved",
        area_id: t.area_id || null,
        visionIds,
        realityIds,
        actionPlans: actionMap.get(t.id) || [],
      };
    });

    // パンくずリスト + 親チャート情報を並列取得
    const [breadcrumbsList, parentInfo] = await Promise.all([
      getBreadcrumbsFromSQL(chart.id),
      getParentChartInfo(chart.id),
    ]);

    // Areasを整形
    const areasList: Area[] = (areas || []).map((a: { id: string; name: string; color: string; sort_order: number; chart_id: string; created_at: string; updated_at: string }) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      sort_order: a.sort_order,
      chart_id: a.chart_id,
      created_at: a.created_at,
      updated_at: a.updated_at,
    }));

    return {
      id: chart.id,
      title: chart.title,
      description: (chart as Record<string, unknown>).description as string | null || null,
      due_date: (chart as Record<string, unknown>).due_date as string | null || null,
      workspace_id: (chart as Record<string, unknown>).workspace_id as string | null ?? null,
      status: ((chart as Record<string, unknown>).status as ChartStatus) || "active",
      visions: Array.from(visionMap.values()) as VisionItem[],
      realities: Array.from(realityMap.values()) as RealityItem[],
      tensions: tensionsWithRelations,
      looseActions,
      areas: areasList,
      parentChartId: parentInfo?.parentChartId,
      parentChartTitle: parentInfo?.parentChartTitle,
      parentActionId: chart.parent_action_id || parentInfo?.parentActionId,
      parentActionTitle: parentInfo?.parentActionTitle,
      breadcrumbs: breadcrumbsList,
    };
  } catch (error) {
    logger.error("[getChartById] Exception", error);
    return null;
  }
}

// パンくずリストをSQL関数で取得（WITH RECURSIVE使用）
async function getBreadcrumbsFromSQL(
  chartId: string
): Promise<Array<{ id: string; title: string; type: "chart" | "action" }>> {
  try {
    const supabase = await createClient();
    // SQL関数を呼び出し
    const { data, error } = await supabase.rpc("get_breadcrumbs", {
      p_chart_id: chartId,
    });

    if (error) {
      logger.error("[getBreadcrumbsFromSQL] RPC error", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 重複排除: 隣り合うアイテムの名前が完全に一致する場合は、子の方を非表示
    const deduplicated: Array<{ id: string; title: string; type: "chart" | "action" }> = [];
    for (let i = 0; i < data.length; i++) {
      const current = data[i];
      const prev = i > 0 ? data[i - 1] : null;
      
      // 前のアイテムとタイトルが完全に一致する場合はスキップ
      if (prev && prev.title === current.title && prev.type === current.type) {
        continue;
      }

      deduplicated.push({
        id: current.id,
        title: current.title,
        type: current.type as "chart" | "action",
      });
    }

    return deduplicated;
  } catch (error) {
    logger.error("[getBreadcrumbsFromSQL] Exception", error);
    return [];
  }
}

// Breadcrumbsを構築（親アクション情報を含む）- 後方互換性のため残す
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _buildBreadcrumbsWithAction(
  parentChartId: string | null,
  parentActionId: string | null | undefined,
  parentInfo: { parentChartId?: string; parentChartTitle?: string; parentActionId?: string; parentActionTitle?: string } | null
): Promise<Array<{ id: string; title: string }>> {
  const breadcrumbs: Array<{ id: string; title: string }> = [];

  // 親チャート情報を追加
  if (parentInfo?.parentChartId && parentInfo?.parentChartTitle) {
    breadcrumbs.push({
      id: parentInfo.parentChartId,
      title: parentInfo.parentChartTitle,
    });
  }

  // 親アクション情報を追加
  if (parentInfo?.parentActionId && parentInfo?.parentActionTitle) {
    breadcrumbs.push({
      id: parentInfo.parentActionId,
      title: parentInfo.parentActionTitle,
    });
  }

  // 現在のチャートを追加
  breadcrumbs.push({ id: "root", title: "全社マスター" });

  return breadcrumbs;
}

// Breadcrumbsを構築（旧版、後方互換性のため残す）
// 注意: この関数は parent_chart_id を使用していましたが、現在のDBスキーマには存在しないため、
// parent_action_id 経由で親チャートを取得する必要があります。
// 実際には getBreadcrumbsFromSQL が使用されているため、この関数は使用されていません。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _buildBreadcrumbs(
  parentChartId: string | null,
  breadcrumbs: Array<{ id: string; title: string }> = []
): Promise<Array<{ id: string; title: string }>> {
  if (!parentChartId) {
    return [{ id: "root", title: "全社マスター" }, ...breadcrumbs];
  }

  // parent_chart_id は存在しないため、parent_action_id 経由で取得する必要があります
  // この関数は実際には使用されていないため、簡易実装に留めます
  const supabase = await createClient();
  const { data: parentChart } = await supabase
    .from("charts")
    .select("id, title, parent_action_id")
    .eq("id", parentChartId)
    .single();

  if (parentChart) {
    const newBreadcrumbs = [
      { id: parentChart.id, title: parentChart.title },
      ...breadcrumbs,
    ];
    // parent_action_id 経由で親チャートを取得する必要があるが、
    // この関数は使用されていないため、ここでは終了します
    return [{ id: "root", title: "全社マスター" }, ...newBreadcrumbs];
  }

  return [{ id: "root", title: "全社マスター" }, ...breadcrumbs];
}

// Vision追加
export async function createVision(
  chartId: string,
  content: string,
  areaId?: string | null
): Promise<VisionItem | null> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    // IDはDBが自動生成するため、idフィールドは含めない
    const insertData: Record<string, unknown> = {
      chart_id: chartId,
      content: content.trim(),
      user_id: user.id,
    };
    if (areaId) {
      insertData.area_id = areaId;
    }

    const { data, error } = await serverSupabase
      .from("visions")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error("[createVision] Supabase error", error);
      return null;
    }

    if (!data) {
      logger.error("[createVision] No data returned from insert");
      return null;
    }

    return {
      id: data.id,
      content: data.content,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      assignee: data.assignee || undefined,
      dueDate: data.due_date || undefined,
      targetDate: data.target_date || undefined,
      isLocked: data.is_locked || false,
      area_id: data.area_id || null,
    };
  } catch (error) {
    logger.error("[createVision] Exception", error);
    return null;
  }
}

// Vision更新
export async function updateVision(
  visionId: string,
  chartId: string,
  updates: Partial<VisionItem>
): Promise<boolean> {
  try {
    const serverClient = await createClient();
    const updateData: Record<string, unknown> = {};
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.assignee !== undefined) updateData.assignee = updates.assignee;
    if (updates.dueDate !== undefined) {
      const v = updates.dueDate;
      updateData.due_date = v === null ? null : (typeof v === "string" && v.length >= 10 ? v.substring(0, 10) : v);
    }
    if (updates.targetDate !== undefined) updateData.target_date = updates.targetDate;
    if (updates.isLocked !== undefined) updateData.is_locked = updates.isLocked;
    if (updates.area_id !== undefined) updateData.area_id = updates.area_id;
    if (updates.description !== undefined) updateData.description = updates.description;

    const { error } = await serverClient
      .from("visions")
      .update(updateData)
      .eq("id", visionId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[updateVision] Supabase update error", error);
      return false;
    }

    const syncUpdates: Record<string, string | null> = {};
    if (updates.dueDate !== undefined) syncUpdates.due_date = updates.dueDate as string | null;
    if (updates.assignee !== undefined) syncUpdates.assignee = updates.assignee as string | null;
    if (updates.area_id !== undefined) syncUpdates.area_id = updates.area_id as string | null;

    if (Object.keys(syncUpdates).length > 0) {
      try {
        const { data: chart } = await serverClient
          .from("charts")
          .select("parent_action_id")
          .eq("id", chartId)
          .single();

        if (chart?.parent_action_id) {
          await serverClient
            .from("actions")
            .update({
              ...syncUpdates,
              updated_at: new Date().toISOString(),
            })
            .eq("id", chart.parent_action_id);
        }
      } catch (syncError) {
        logger.error("[updateVision] Failed to sync with parent action", syncError);
      }
    }

    return true;
  } catch (error) {
    logger.error("[updateVision] Exception", error);
    return false;
  }
}

// Vision削除
export async function deleteVision(
  visionId: string,
  chartId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("visions")
      .delete()
      .eq("id", visionId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[deleteVision] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[deleteVision] Exception", error);
    return false;
  }
}

// Reality追加
export async function createReality(
  chartId: string,
  content: string,
  areaId?: string | null
): Promise<RealityItem | null> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    // IDはDBが自動生成するため、idフィールドは含めない
    const insertData: Record<string, unknown> = {
      chart_id: chartId,
      content: content.trim(),
      user_id: user.id,
    };
    if (areaId) {
      insertData.area_id = areaId;
    }

    const { data, error } = await serverSupabase
      .from("realities")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error("[createReality] Supabase error", error);
      return null;
    }

    if (!data) {
      logger.error("[createReality] No data returned from insert");
      return null;
    }

    return {
      id: data.id,
      content: data.content,
      createdAt: data.created_at,
      dueDate: data.due_date || undefined,
      relatedVisionId: data.related_vision_id || undefined,
      area_id: data.area_id || null,
      created_by: data.created_by || user.id,
      created_by_profile: null,
    };
  } catch (error) {
    logger.error("[createReality] Exception", error);
    return null;
  }
}

// Reality更新
export async function updateReality(
  realityId: string,
  chartId: string,
  updates: Partial<Pick<RealityItem, "content" | "isLocked" | "area_id" | "dueDate" | "description">>
): Promise<boolean> {
  try {
    const serverClient = await createClient();
    const updateData: Record<string, unknown> = {};
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.isLocked !== undefined) updateData.is_locked = updates.isLocked;
    if (updates.area_id !== undefined) updateData.area_id = updates.area_id;
    if (updates.dueDate !== undefined) {
      const v = updates.dueDate;
      updateData.due_date = v === null ? null : (typeof v === "string" && v.length >= 10 ? v.substring(0, 10) : v);
    }
    if (updates.description !== undefined) updateData.description = updates.description;

    const { error } = await serverClient
      .from("realities")
      .update(updateData)
      .eq("id", realityId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[updateReality] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[updateReality] Exception", error);
    return false;
  }
}

// Reality削除
export async function deleteReality(
  realityId: string,
  chartId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("realities")
      .delete()
      .eq("id", realityId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[deleteReality] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[deleteReality] Exception", error);
    return false;
  }
}

// Tension追加
export async function createTension(
  chartId: string,
  title: string = "",
  areaId?: string | null
): Promise<Tension | null> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    const { data, error } = await serverSupabase
      .from("tensions")
      .insert({
        chart_id: chartId,
        title,
        status: "active",
        area_id: areaId ?? null,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      logger.error("[createTension] Supabase error", error);
      return null;
    }

    return {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      status: data.status as "active" | "review_needed" | "resolved",
      area_id: data.area_id || null,
      visionIds: [],
      realityIds: [],
      actionPlans: [],
    };
  } catch (error) {
    logger.error("[createTension] Exception", error);
    return null;
  }
}

// Tension更新
export async function updateTension(
  tensionId: string,
  chartId: string,
  updates: Partial<Pick<Tension, "title" | "description" | "status">>
): Promise<boolean> {
  try {
    const serverClient = await createClient();
    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.status !== undefined) updateData.status = updates.status;

    const { error } = await serverClient
      .from("tensions")
      .update(updateData)
      .eq("id", tensionId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[updateTension] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[updateTension] Exception", error);
    return false;
  }
}

// Tension削除
export async function deleteTension(
  tensionId: string,
  chartId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("tensions")
      .delete()
      .eq("id", tensionId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[deleteTension] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[deleteTension] Exception", error);
    return false;
  }
}

// Tension-Vision関係の更新
export async function toggleTensionVisionLink(
  tensionId: string,
  visionId: string,
  chartId: string,
  isLinked: boolean
): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (isLinked) {
      // リンクを削除
      const { error } = await supabase
        .from("tension_visions")
        .delete()
        .eq("tension_id", tensionId)
        .eq("vision_id", visionId);

      if (error) {
        logger.error("[toggleTensionVisionLink] remove error", error);
        return false;
      }
    } else {
      // リンクを追加
      const user = await getAuthenticatedUser();
      const { error } = await supabase
        .from("tension_visions")
        .insert({
          tension_id: tensionId,
          vision_id: visionId,
          user_id: user.id,
        });

      if (error) {
        logger.error("[toggleTensionVisionLink] add error", error);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error("[toggleTensionVisionLink] Exception", error);
    return false;
  }
}

// Tension-Reality関係の更新
export async function toggleTensionRealityLink(
  tensionId: string,
  realityId: string,
  chartId: string,
  isLinked: boolean
): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (isLinked) {
      // リンクを削除
      const { error } = await supabase
        .from("tension_realities")
        .delete()
        .eq("tension_id", tensionId)
        .eq("reality_id", realityId);

      if (error) {
        logger.error("[toggleTensionRealityLink] remove error", error);
        return false;
      }
    } else {
      // リンクを追加
      const user = await getAuthenticatedUser();
      const { error } = await supabase
        .from("tension_realities")
        .insert({
          tension_id: tensionId,
          reality_id: realityId,
          user_id: user.id,
        });

      if (error) {
        logger.error("[toggleTensionRealityLink] add error", error);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error("[toggleTensionRealityLink] Exception", error);
    return false;
  }
}

// Action追加
export async function createAction(
  tensionId: string | null,
  title: string,
  areaId?: string | null,
  chartIdInput?: string | null
): Promise<{ action: ActionPlan | null; chartId: string | null }> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    let chartId = chartIdInput || null;
    if (tensionId) {
      const { data: tension, error: tensionError } = await serverSupabase
        .from("tensions")
        .select("chart_id")
        .eq("id", tensionId)
        .single();

      if (tensionError || !tension) {
        logger.error("[createAction] Error fetching tension", tensionError);
        return { action: null, chartId: null };
      }

      chartId = tension.chart_id;
    }

    if (!chartId) {
      logger.error("[createAction] chartId is required");
      return { action: null, chartId: null };
    }

    const insertData: Record<string, unknown> = {
      chart_id: chartId,
      tension_id: tensionId,
      title,
      has_sub_chart: false,
      user_id: user.id,
    };
    if (areaId) {
      insertData.area_id = areaId;
    }

    const { data, error } = await serverSupabase
      .from("actions")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error("[createAction] Supabase error", error);
      return { action: null, chartId };
    }

    return {
      action: {
        id: data.id,
        title: data.title,
        dueDate: data.due_date || undefined,
        assignee: data.assignee || undefined,
        hasSubChart: data.has_sub_chart || false,
        subChartId: data.sub_chart_id || undefined,
        childChartId: data.child_chart_id || undefined,
        area_id: data.area_id || null,
      },
      chartId,
    };
  } catch (error) {
    logger.error("[createAction] Exception", error);
    return { action: null, chartId: null };
  }
}

// Action更新
export async function updateAction(
  actionId: string,
  tensionId: string | null,
  updates: Partial<ActionPlan>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _chartId?: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate;
    if (updates.assignee !== undefined) updateData.assignee = updates.assignee;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.hasSubChart !== undefined)
      updateData.has_sub_chart = updates.hasSubChart;
    if (updates.subChartId !== undefined)
      updateData.sub_chart_id = updates.subChartId;
    if (updates.childChartId !== undefined)
      updateData.child_chart_id = updates.childChartId;
    if (updates.isCompleted !== undefined)
      updateData.is_completed = updates.isCompleted;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.area_id !== undefined) updateData.area_id = updates.area_id;

    // idはprimary key（UUID）なので一意に特定できる。
    // tension_id/chart_idの追加条件は、値のずれで0行更新を引き起こすため削除。
    // アクセス制御はSupabaseのRLSで担保する。
    const { error } = await supabase
      .from("actions")
      .update(updateData)
      .eq("id", actionId);

    if (error) {
      logger.error("[updateAction] Supabase error", error);
      return false;
    }

    const syncUpdates: Record<string, string | null> = {};
    if (updates.dueDate !== undefined) syncUpdates.due_date = updates.dueDate as string | null;
    if (updates.assignee !== undefined) syncUpdates.assignee = updates.assignee as string | null;
    if (updates.area_id !== undefined) syncUpdates.area_id = updates.area_id as string | null;

    if (Object.keys(syncUpdates).length > 0) {
      try {
        let childChartId = updates.childChartId;
        if (!childChartId) {
          const { data: action } = await supabase
            .from("actions")
            .select("child_chart_id")
            .eq("id", actionId)
            .single();
          childChartId = action?.child_chart_id || undefined;
        }

        if (childChartId) {
          await supabase
            .from("visions")
            .update({
              ...syncUpdates,
              updated_at: new Date().toISOString(),
            })
            .eq("chart_id", childChartId);
        }
      } catch (syncError) {
        logger.error("[updateAction] Failed to sync child visions", syncError);
      }
    }

    return true;
  } catch (error) {
    logger.error("[updateAction] Exception", error);
    return false;
  }
}

// Action削除
export async function deleteAction(
  actionId: string,
  tensionId: string | null,
  chartId?: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    let query = supabase.from("actions").delete().eq("id", actionId);
    if (tensionId) {
      query = query.eq("tension_id", tensionId);
    } else {
      query = query.is("tension_id", null);
      if (chartId) {
        query = query.eq("chart_id", chartId);
      }
    }
    const { error } = await query;

    if (error) {
      logger.error("[deleteAction] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[deleteAction] Exception", error);
    return false;
  }
}

// Chart status更新
export async function updateChartStatus(
  chartId: string,
  status: ChartStatus
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("charts")
      .update({ status })
      .eq("id", chartId);

    if (error) return { error: error.message };
    return {};
  } catch (error) {
    logger.error("[updateChartStatus] Exception", error);
    return { error: "予期せぬエラーが発生しました" };
  }
}

// Chart更新（タイトル、概要、期限など）
export async function updateChart(
  chartId: string,
  updates: { title?: string; description?: string | null; due_date?: Date | string | null }
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.due_date !== undefined) {
      // Dateオブジェクトの場合はISO文字列に変換、nullの場合はそのまま
      updateData.due_date = updates.due_date instanceof Date
        ? updates.due_date.toISOString().split('T')[0]
        : updates.due_date;
    }

    const { error } = await supabase
      .from("charts")
      .update(updateData)
      .eq("id", chartId);

    if (error) {
      logger.error("[updateChart] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[updateChart] Exception", error);
    return false;
  }
}

// テレスコーピング: アクションから子チャートを作成または取得
export async function telescopeAction(
  actionId: string,
  tensionId: string | null,
  chartId?: string
): Promise<string | null> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    // 1. アクション情報を取得
    let actionQuery = serverSupabase
      .from("actions")
      .select("id, title, child_chart_id, due_date, area_id, assignee, chart_id")
      .eq("id", actionId);
    if (tensionId) {
      actionQuery = actionQuery.eq("tension_id", tensionId);
    } else {
      actionQuery = actionQuery.is("tension_id", null);
      if (chartId) {
        actionQuery = actionQuery.eq("chart_id", chartId);
      }
    }

    const { data: action, error: actionError } = await actionQuery.single();

    if (actionError || !action) {
      logger.error("[telescopeAction] Error fetching action", actionError);
      return null;
    }
    // 2. 既に子チャートが存在する場合はそのIDを返す
    if (action.child_chart_id) {
      return action.child_chart_id;
    }

    // 2.5. 親チャートのworkspace_idを取得（子チャートを同じワークスペースに作成）
    const { data: parentChart, error: parentChartError } = await serverSupabase
      .from("charts")
      .select("workspace_id")
      .eq("id", action.chart_id)
      .single();
    const workspaceId =
      !parentChartError && parentChart?.workspace_id
        ? parentChart.workspace_id
        : await getOrCreateWorkspace();

    // 3. 新規チャート作成フロー
    // 3-1. 新しいチャートを作成
    const { data: newChart, error: chartError } = await serverSupabase
      .from("charts")
      .insert({
        title: action.title,
        parent_action_id: actionId,
        due_date: action.due_date,
        user_id: user.id,
        workspace_id: workspaceId,
      })
      .select()
      .single();

    if (chartError || !newChart) {
      logger.error("[telescopeAction] Error creating chart", chartError);
      return null;
    }
    // 3-2. 親アクションのタグを1つだけ子チャートにコピー
    let childAreaId: string | null = null;
    if (action.area_id) {
      const { data: parentArea, error: parentAreaError } = await serverSupabase
        .from("areas")
        .select("id, name, color, sort_order")
        .eq("id", action.area_id)
        .single();

      if (parentAreaError) {
        logger.warn("[telescopeAction] Failed to fetch parent area", {
          error: logger.extractSafeError(parentAreaError),
        });
      } else if (parentArea) {
        const { data: createdArea, error: areaError } = await serverSupabase
          .from("areas")
          .insert({
            chart_id: newChart.id,
            name: parentArea.name,
            color: parentArea.color,
            sort_order: parentArea.sort_order ?? 0,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (areaError) {
          logger.warn("[telescopeAction] Failed to copy area", {
            error: logger.extractSafeError(areaError),
          });
        } else {
          childAreaId = createdArea?.id ?? null;
        }
      }
    }

    // 3-3. 親アクションのタイトルをVisionとして自動登録
    const { error: visionError } = await serverSupabase
      .from("visions")
      .insert({
        chart_id: newChart.id,
        content: action.title,
        due_date: action.due_date,
        area_id: childAreaId,
        assignee: action.assignee,
        user_id: user.id,
      });

    if (visionError) {
      logger.error("[telescopeAction] Error creating vision", visionError);
      // Visionの作成に失敗してもチャートは作成されているので、チャートIDを返す
    }
    // 3-4. 親アクションのchild_chart_idを更新
    const { error: updateActionError } = await serverSupabase
      .from("actions")
      .update({ child_chart_id: newChart.id, has_sub_chart: true })
      .eq("id", actionId);

    if (updateActionError) {
      logger.error("[telescopeAction] Error updating action", updateActionError);
      // チャートは作成されたが、アクションの更新に失敗した場合もチャートIDを返す
      return newChart.id;
    }
    return newChart.id;
  } catch (error) {
    logger.error("[telescopeAction] Exception", error);
    return null;
  }
}

// 親チャートと親アクション情報を取得（パンくずリスト用）
export async function getParentChartInfo(
  chartId: string
): Promise<{ parentChartId?: string; parentChartTitle?: string; parentActionId?: string; parentActionTitle?: string } | null> {
  try {
    const supabase = await createClient();
    const { data: chart, error } = await supabase
      .from("charts")
      .select("id, title, parent_action_id")
      .eq("id", chartId)
      .single();

    if (error || !chart) {
      return null;
    }

    let parentChartId: string | undefined;
    let parentChartTitle: string | undefined;
    let parentActionId: string | undefined;
    let parentActionTitle: string | undefined;

    // parent_action_idから親アクション情報を取得
    if (chart.parent_action_id) {
      const { data: parentAction } = await supabase
        .from("actions")
        .select("id, title, tension_id, chart_id")
        .eq("id", chart.parent_action_id)
        .single();

      if (parentAction) {
        parentActionId = parentAction.id;
        parentActionTitle = parentAction.title;

        // 親アクションから親チャート情報を取得
      if (!parentAction.tension_id) {
        return null;
      }

        if (parentAction.tension_id) {
          const { data: parentTension } = await supabase
            .from("tensions")
            .select("chart_id")
            .eq("id", parentAction.tension_id)
            .single();

          if (parentTension) {
            const { data: parentChart } = await supabase
              .from("charts")
              .select("id, title")
              .eq("id", parentTension.chart_id)
              .single();

            if (parentChart) {
              parentChartId = parentChart.id;
              parentChartTitle = parentChart.title;
            }
          }
        } else if (parentAction.chart_id) {
          const { data: parentChart } = await supabase
            .from("charts")
            .select("id, title")
            .eq("id", parentAction.chart_id)
            .single();

          if (parentChart) {
            parentChartId = parentChart.id;
            parentChartTitle = parentChart.title;
          }
        }
      }
    }

    return {
      parentChartId,
      parentChartTitle,
      parentActionId,
      parentActionTitle,
    };
  } catch (error) {
    logger.error("[getParentChartInfo] Exception", error);
    return null;
  }
}

// 子チャートの進捗情報を取得（Action消化率）
export async function getChildChartProgress(
  childChartId: string
): Promise<{ total: number; completed: number; percentage: number } | null> {
  try {
    const supabase = await createClient();
    // 子チャートのすべてのTensionを取得
    const { data: tensions } = await supabase
      .from("tensions")
      .select("id, status")
      .eq("chart_id", childChartId);

    if (!tensions || tensions.length === 0) {
      return { total: 0, completed: 0, percentage: 0 };
    }

    const tensionIds = tensions.map((t: { id: string }) => t.id);

    // すべてのActionを取得
    const { data: actions } = await supabase
      .from("actions")
      .select("id")
      .in("tension_id", tensionIds);

    if (!actions) {
      return { total: 0, completed: 0, percentage: 0 };
    }

    const total = actions.length;
    // Tensionのstatusが'resolved'のものを完了としてカウント
    // 注意: より正確には、各Actionにstatusフィールドを追加する方が良いが、
    // 現在はTensionのstatusで判定
    const resolvedTensionIds = tensions
      .filter((t: { id: string; status: string }) => t.status === "resolved")
      .map((t: { id: string; status: string }) => t.id);
    
    const { data: completedActions } = await supabase
      .from("actions")
      .select("id")
      .in("tension_id", resolvedTensionIds);

    const completed = completedActions?.length || 0;

    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  } catch (error) {
    logger.error("[getChildChartProgress] Exception", error);
    return null;
  }
}

// エリア作成
export async function createArea(
  chartId: string,
  name: string,
  color: string = "#3b82f6"
): Promise<Area | null> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    // 既存のエリアの最大sort_orderを取得
    const { data: existingAreas } = await serverSupabase
      .from("areas")
      .select("sort_order")
      .eq("chart_id", chartId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const maxSortOrder = existingAreas && existingAreas.length > 0 
      ? existingAreas[0].sort_order 
      : 0;

    const { data, error } = await serverSupabase
      .from("areas")
      .insert({
        chart_id: chartId,
        name: name.trim(),
        color: color,
        sort_order: maxSortOrder + 1,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      logger.error("[createArea] Supabase error", error);
      return null;
    }

    if (!data) {
      logger.error("[createArea] No data returned from insert");
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      color: data.color,
      sort_order: data.sort_order,
      chart_id: data.chart_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    logger.error("[createArea] Exception", error);
    return null;
  }
}

// エリア更新
export async function updateArea(
  areaId: string,
  chartId: string,
  updates: Partial<Pick<Area, "name" | "color">>
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.color !== undefined) updateData.color = updates.color;

    const { error } = await supabase
      .from("areas")
      .update(updateData)
      .eq("id", areaId)
      .eq("chart_id", chartId);

    if (error) {
      logger.error("[updateArea] Supabase error", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[updateArea] Exception", error);
    return false;
  }
}

// エリア削除（削除前に、そのエリアが付いているVision/Realityを未分類に戻す）
export async function deleteArea(
  areaId: string,
  chartId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    // まず、そのエリアが付いているVisionとRealityを未分類（null）に戻す
    const { error: visionError } = await supabase
      .from("visions")
      .update({ area_id: null })
      .eq("area_id", areaId)
      .eq("chart_id", chartId);

    if (visionError) {
      logger.error("[deleteArea] Error updating visions", visionError);
      return false;
    }

    const { error: realityError } = await supabase
      .from("realities")
      .update({ area_id: null })
      .eq("area_id", areaId)
      .eq("chart_id", chartId);

    if (realityError) {
      logger.error("[deleteArea] Error updating realities", realityError);
      return false;
    }

    // エリアを削除
    const { error: deleteError } = await supabase
      .from("areas")
      .delete()
      .eq("id", areaId)
      .eq("chart_id", chartId);

    if (deleteError) {
      logger.error("[deleteArea] Supabase error", deleteError);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[deleteArea] Exception", error);
    return false;
  }
}

// 履歴取得
export async function getItemHistory(
  itemType: "vision" | "reality" | "action",
  itemId: string
): Promise<HistoryItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("item_history")
      .select("*")
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("[getItemHistory] Supabase error", error);
      return [];
    }

    return (data || []).map((item: { id: string; content: string; type: string; created_at: string; created_by: string | null }) => ({
      id: item.id,
      content: item.content,
      type: item.type as "update" | "comment",
      createdAt: item.created_at,
      createdBy: item.created_by || undefined,
    }));
  } catch (error) {
    logger.error("[getItemHistory] Exception", error);
    return [];
  }
}

// 履歴追加
export async function addItemHistory(
  itemType: "vision" | "reality" | "action",
  itemId: string,
  content: string,
  type: "update" | "comment",
  updateMainContent: boolean
): Promise<HistoryItem | null> {
  try {
    const user = await getAuthenticatedUser();
    const serverSupabase = await createClient();
    // 履歴を追加
    const { data, error } = await serverSupabase
      .from("item_history")
      .insert({
        item_type: itemType,
        item_id: itemId,
        content: content.trim(),
        type,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      logger.error("[addItemHistory] Supabase error", error);
      return null;
    }

    // メインコンテンツも更新する場合
    if (updateMainContent && type === "update") {
      if (itemType === "vision") {
        await serverSupabase
          .from("visions")
          .update({ content: content.trim() })
          .eq("id", itemId);
      } else if (itemType === "reality") {
        await serverSupabase
          .from("realities")
          .update({ content: content.trim() })
          .eq("id", itemId);
      } else if (itemType === "action") {
        await serverSupabase
          .from("actions")
          .update({ title: content.trim() })
          .eq("id", itemId);
      }
    }

    return {
      id: data.id,
      content: data.content,
      type: data.type as "update" | "comment",
      createdAt: data.created_at,
      createdBy: data.created_by || undefined,
    };
  } catch (error) {
    logger.error("[addItemHistory] Exception", error);
    return null;
  }
}

