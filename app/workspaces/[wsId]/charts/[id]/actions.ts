"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { detectService, SERVICE_LABELS } from "@/lib/link-utils";

async function revalidateChartPath(chartId: string) {
  const supabaseClient = await createClient();
  const { data } = await supabaseClient.from("charts").select("workspace_id").eq("id", chartId).single();
  if (data?.workspace_id) {
    revalidatePath(`/workspaces/${data.workspace_id}/charts/${chartId}`);
    revalidatePath(`/workspaces/${data.workspace_id}/charts`);
  }
}

async function recordChartHistory(
  chartId: string,
  entityType: "vision" | "reality" | "tension" | "action" | "comment" | "attachment",
  entityId: string,
  eventType: "created" | "updated" | "deleted" | "completed" | "reopened" | "moved",
  field?: string | null,
  oldValue?: string | null,
  newValue?: string | null
) {
  try {
    const supabaseClient = await createClient();
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const { error } = await supabaseClient.from("chart_history").insert({
      chart_id: chartId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      field: field ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      user_id: user.id,
    });
    if (error) console.error("[chart_history]", error);
  } catch (e) {
    console.error("[chart_history] unexpected:", e);
  }
}

import { getAuthenticatedUser } from "@/lib/auth";
import { collectTreeSnapshotData, saveTreeSnapshot } from "@/lib/tree-snapshot";
import { parseMentionsFromHtml } from "@/lib/mention-utils";
import {
  getChartById,
  createVision,
  updateVision,
  deleteVision,
  createReality,
  updateReality,
  deleteReality,
  createTension,
  updateTension,
  deleteTension,
  toggleTensionVisionLink,
  toggleTensionRealityLink,
  createAction,
  updateAction,
  deleteAction,
  updateChart,
  updateChartStatus,
  telescopeAction,
  getChildChartProgress,
  createArea,
  updateArea,
  deleteArea,
  getItemHistory,
  addItemHistory,
} from "@/lib/supabase/queries";
import type {
  VisionItem,
  RealityItem,
  Tension,
  ActionPlan,
  TensionStatus,
  Area,
  HistoryItem,
  ChartStatus,
} from "@/types/chart";

// Chart取得
export async function fetchChart(chartId: string) {
  const chart = await getChartById(chartId);
  return chart;
}

// Vision操作
export async function addVision(chartId: string, content: string, areaId?: string | null) {
  const result = await createVision(chartId, content, areaId);
  if (result) {
    await recordChartHistory(chartId, "vision", result.id, "created", null, null, content);
    await revalidateChartPath(chartId);
  } else {
    console.error("[addVision] 失敗 - result is null");
  }
  return result;
}

export async function updateVisionItem(
  visionId: string,
  chartId: string,
  field: "content" | "assignee" | "dueDate" | "targetDate" | "isLocked" | "areaId" | "description",
  value: string | boolean | null
) {
  const updates: Partial<VisionItem> = {};
  if (field === "content") updates.content = value as string;
  if (field === "assignee") updates.assignee = value as string;
  if (field === "dueDate") updates.dueDate = value as string;
  if (field === "targetDate") updates.targetDate = value as string;
  if (field === "isLocked") updates.isLocked = value as boolean;
  if (field === "areaId") updates.area_id = value as string | null;
  if (field === "description") updates.description = value as string;

  const result = await updateVision(visionId, chartId, updates);
  if (result) {
    await recordChartHistory(chartId, "vision", visionId, "updated", field, null, String(value ?? ""));
    await revalidateChartPath(chartId);
  } else {
    console.error("[updateVisionItem] 失敗");
  }
  return result;
}

export async function removeVision(visionId: string, chartId: string) {
  const result = await deleteVision(visionId, chartId);
  if (result) {
    await recordChartHistory(chartId, "vision", visionId, "deleted");
    await revalidateChartPath(chartId);
  } else {
    console.error("[removeVision] 失敗");
  }
  return result;
}

// Reality操作
export async function addReality(chartId: string, content: string, areaId?: string | null) {
  const result = await createReality(chartId, content, areaId);
  if (result) {
    await recordChartHistory(chartId, "reality", result.id, "created", null, null, content);
    await revalidateChartPath(chartId);
  } else {
    console.error("[addReality] 失敗 - result is null");
  }
  return result;
}

export async function updateRealityItem(
  realityId: string,
  chartId: string,
  field: "content" | "isLocked" | "areaId" | "dueDate" | "description",
  value: string | boolean | null
) {
  const updates: any = {};
  if (field === "content") updates.content = value as string;
  if (field === "isLocked") updates.isLocked = value as boolean;
  if (field === "areaId") updates.area_id = value as string | null;
  if (field === "dueDate") updates.dueDate = value as string | null;
  if (field === "description") updates.description = value as string;
  const result = await updateReality(realityId, chartId, updates);
  if (result) {
    await recordChartHistory(chartId, "reality", realityId, "updated", field, null, String(value ?? ""));
    await revalidateChartPath(chartId);
  } else {
    console.error("[updateRealityItem] 失敗");
  }
  return result;
}

// エリア作成
export async function addArea(chartId: string, name: string, color?: string) {
  const result = await createArea(chartId, name, color);
  if (result) {
    await revalidateChartPath(chartId);
  } else {
    console.error("[addArea] 失敗 - result is null");
  }
  return result;
}

export async function updateAreaItem(
  areaId: string,
  chartId: string,
  updates: Partial<Pick<Area, "name" | "color">>
) {
  const result = await updateArea(areaId, chartId, updates);
  if (result) {
    await revalidateChartPath(chartId);
  } else {
    console.error("[updateAreaItem] 失敗");
  }
  return result;
}

export async function removeArea(areaId: string, chartId: string) {
  const result = await deleteArea(areaId, chartId);
  if (result) {
    await revalidateChartPath(chartId);
  } else {
    console.error("[removeArea] 失敗");
  }
  return result;
}

export async function updateAreaOrder(
  chartId: string,
  areaOrders: { areaId: string; sort_order: number }[]
) {
  try {
    const supabase = await createClient();
    for (const { areaId, sort_order } of areaOrders) {
      const { error } = await supabase
        .from("areas")
        .update({ sort_order })
        .eq("id", areaId)
        .eq("chart_id", chartId);
      if (error) {
        console.error("[updateAreaOrder] Error updating area:", areaId, error);
        return false;
      }
    }
    await revalidateChartPath(chartId);
    return true;
  } catch (error) {
    console.error("[updateAreaOrder] Exception:", error);
    return false;
  }
}

export async function removeReality(realityId: string, chartId: string) {
  const result = await deleteReality(realityId, chartId);
  if (result) {
    await recordChartHistory(chartId, "reality", realityId, "deleted");
    await revalidateChartPath(chartId);
  } else {
    console.error("[removeReality] 失敗");
  }
  return result;
}

// Tension操作
export async function addTension(
  chartId: string,
  title: string = "",
  areaId?: string | null
) {
  const normalizedAreaId = areaId ?? null;
  const result = await createTension(chartId, title, normalizedAreaId);
  if (result) {
    await recordChartHistory(chartId, "tension", result.id, "created", null, null, title);
    await revalidateChartPath(chartId);
  } else {
    console.error("[addTension] 失敗");
  }
  return result;
}

export async function updateTensionItem(
  tensionId: string,
  chartId: string,
  field: "title" | "description" | "status",
  value: string | TensionStatus
) {
  const updates: Partial<Tension> = {};
  if (field === "title") updates.title = value as string;
  if (field === "description") updates.description = value as string;
  if (field === "status") updates.status = value as TensionStatus;

  const result = await updateTension(tensionId, chartId, updates);
  if (result) {
    const eventType =
      field === "status" && value === "resolved"
        ? "completed"
        : field === "status" && value === "active"
          ? "reopened"
          : "updated";
    await recordChartHistory(chartId, "tension", tensionId, eventType, field, null, String(value ?? ""));
    await revalidateChartPath(chartId);
  } else {
    console.error("[updateTensionItem] 失敗");
  }
  return result;
}

export async function removeTension(tensionId: string, chartId: string) {
  const result = await deleteTension(tensionId, chartId);
  if (result) {
    await recordChartHistory(chartId, "tension", tensionId, "deleted");
    await revalidateChartPath(chartId);
  } else {
    console.error("[removeTension] 失敗");
  }
  return result;
}

// Tension-Vision/Reality関係操作
export async function toggleVisionRealityLinkAction(
  tensionId: string,
  type: "vision" | "reality",
  itemId: string,
  chartId: string,
  isCurrentlyLinked: boolean
) {
  let result: boolean;
  if (type === "vision") {
    result = await toggleTensionVisionLink(
      tensionId,
      itemId,
      chartId,
      isCurrentlyLinked
    );
  } else {
    result = await toggleTensionRealityLink(
      tensionId,
      itemId,
      chartId,
      isCurrentlyLinked
    );
  }
  if (result) {
    await revalidateChartPath(chartId);
  } else {
    console.error("[toggleVisionRealityLinkAction] 失敗");
  }
  return result;
}

// Action操作
export async function addActionPlan(
  tensionId: string | null,
  title: string,
  areaId?: string | null,
  chartId?: string | null
) {
  const result = await createAction(tensionId, title, areaId, chartId);
  if (result.action && result.chartId) {
    await recordChartHistory(result.chartId, "action", result.action.id, "created", null, null, title);
    await revalidateChartPath(result.chartId);
  } else {
    console.error("[addActionPlan] 失敗 - action or chartId is null");
  }
  return result.action;
}

export async function updateActionPlanItem(
  actionId: string,
  tensionId: string | null,
  field:
    | "title"
    | "dueDate"
    | "assignee"
    | "status"
    | "hasSubChart"
    | "subChartId"
    | "childChartId"
    | "isCompleted"
    | "description"
    | "areaId",
  value: string | boolean | null,
  chartId?: string
) {

  const updates: Partial<ActionPlan> = {};
  if (field === "title") updates.title = value as string;
  if (field === "dueDate") updates.dueDate = value as string;
  if (field === "assignee") updates.assignee = value as string;
  if (field === "status") {
    updates.status = value as ActionPlan["status"];
    updates.isCompleted = value === "done";
  }
  if (field === "hasSubChart") updates.hasSubChart = value as boolean;
  if (field === "subChartId") updates.subChartId = value as string;
  if (field === "childChartId") updates.childChartId = value as string;
  if (field === "isCompleted") updates.isCompleted = value as boolean;
  if (field === "description") {
    // 空文字の場合はnullに変換（DBの一貫性のため）
    updates.description = (value as string) === "" ? null : (value as string);
  }
  if (field === "areaId") {
    updates.area_id = value as string | null;
  }

  const result = await updateAction(actionId, tensionId, updates, chartId);
  if (result) {
    if (field === "dueDate") {
      try {
        const supabase = await createClient();
        const { data: action, error: actionError } = await supabase
          .from("actions")
          .select("child_chart_id")
          .eq("id", actionId)
          .single();
        if (actionError) {
          console.error(
            "[updateActionPlanItem] child chart fetch error:",
            actionError
          );
        } else if (action?.child_chart_id) {
          const { error: chartUpdateError } = await supabase
            .from("charts")
            .update({ due_date: value })
            .eq("id", action.child_chart_id);
          if (chartUpdateError) {
            console.error(
              "[updateActionPlanItem] child chart due_date update error:",
              chartUpdateError
            );
          }
        }
      } catch (error) {
        console.error(
          "[updateActionPlanItem] child chart due_date update failed:",
          error
        );
      }
    }
    // dueDateが変更された場合は並び順が変わる可能性があるため、revalidatePathを呼ぶ
    if (field === "dueDate" && chartId) {
      await revalidateChartPath(chartId);
    }
  } else {
    console.error("[updateActionPlanItem] DB save failed for field:", field);
    console.error("[updateActionPlanItem] 失敗");
  }
  return result;
}

export async function removeActionPlan(actionId: string, tensionId: string | null, chartId?: string) {
  if (chartId) {
    await recordChartHistory(chartId, "action", actionId, "deleted");
  }
  return await deleteAction(actionId, tensionId, chartId);
}

// リストの並び順を更新
export async function updateListOrder(
  items: { id: string; sort_order: number }[],
  table: "visions" | "realities" | "tensions" | "actions",
  chartId?: string,
  tensionId?: string
) {
  const supabase = await createClient();

  try {
    // 各アイテムのsort_orderを一括更新
    for (const item of items) {
      let query = supabase.from(table).update({ sort_order: item.sort_order }).eq("id", item.id);
      
      // chart_idまたはtension_idでフィルタリング（セキュリティのため）
      if (table === "visions" || table === "realities" || table === "tensions") {
        if (!chartId) {
          console.error("[updateListOrder] chartId is required for", table);
          return false;
        }
        query = query.eq("chart_id", chartId);
      } else if (table === "actions") {
        if (tensionId) {
          query = query.eq("tension_id", tensionId);
        } else if (chartId) {
          query = query.eq("chart_id", chartId).is("tension_id", null);
        } else {
          console.error("[updateListOrder] chartId is required for loose actions");
          return false;
        }
      }

      const { error } = await query;
      if (error) {
        console.error(`[updateListOrder] Error updating ${item.id}:`, error);
        return false;
      }
    }

    if (chartId) {
      await revalidateChartPath(chartId);
    }
    return true;
  } catch (error) {
    console.error("[updateListOrder] Exception:", error);
    return false;
  }
}

// Area移動: Vision
export async function updateVisionArea(
  visionId: string,
  areaId: string | null,
  projectId: string
) {
  // ========== デバッグログ開始 ==========
  // ========== デバッグログ終了 ==========

  try {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("visions")
      .select("area_id")
      .eq("id", visionId)
      .single();
    const oldAreaId = existing?.area_id ?? null;

    let maxOrderQuery: any = supabase
      .from("visions")
      .select("sort_order")
      .eq("chart_id", projectId)
      .is("due_date", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (areaId === null) {
      maxOrderQuery = maxOrderQuery.is("area_id", null);
    } else {
      maxOrderQuery = maxOrderQuery.eq("area_id", areaId);
    }

    const { data: maxOrderItem, error: maxOrderError } = await maxOrderQuery;

    if (maxOrderError) throw maxOrderError;

    const newSortOrder = (maxOrderItem?.sort_order ?? 0) + 1;

    const { error } = await supabase
      .from("visions")
      .update({
        area_id: areaId,
        sort_order: newSortOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", visionId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "saveFailed" };
    }

    await recordChartHistory(projectId, "vision", visionId, "updated", "area_id", oldAreaId ?? null, areaId ?? null);
    await revalidateChartPath(projectId);
    const result = { success: true };
    return result;
  } catch (error) {
    console.error("❌❌❌ Server action exception:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

// Area移動: Reality
export async function updateRealityArea(
  realityId: string,
  areaId: string | null,
  projectId: string
) {
  try {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("realities")
      .select("area_id")
      .eq("id", realityId)
      .single();
    const oldAreaId = existing?.area_id ?? null;

    let maxOrderQuery: any = supabase
      .from("realities")
      .select("sort_order")
      .eq("chart_id", projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (areaId === null) {
      maxOrderQuery = maxOrderQuery.is("area_id", null);
    } else {
      maxOrderQuery = maxOrderQuery.eq("area_id", areaId);
    }

    const { data: maxOrderItem, error: maxOrderError } = await maxOrderQuery;

    if (maxOrderError) throw maxOrderError;

    const newSortOrder = (maxOrderItem?.sort_order ?? 0) + 1;

    const { error } = await supabase
      .from("realities")
      .update({
        area_id: areaId,
        sort_order: newSortOrder,
      })
      .eq("id", realityId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "saveFailed" };
    }

    await recordChartHistory(projectId, "reality", realityId, "updated", "area_id", oldAreaId ?? null, areaId ?? null);
    await revalidateChartPath(projectId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

// Area移動: Tension
export async function updateTensionArea(
  tensionId: string,
  areaId: string | null,
  projectId: string,
  updateChildActions: boolean = true
) {
  try {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("tensions")
      .select("area_id")
      .eq("id", tensionId)
      .single();
    const oldAreaId = existing?.area_id ?? null;

    let maxOrderQuery: any = supabase
      .from("tensions")
      .select("sort_order")
      .eq("chart_id", projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (areaId === null) {
      maxOrderQuery = maxOrderQuery.is("area_id", null);
    } else {
      maxOrderQuery = maxOrderQuery.eq("area_id", areaId);
    }

    const { data: maxOrderItem, error: maxOrderError } = await maxOrderQuery;

    if (maxOrderError) throw maxOrderError;

    const newSortOrder = (maxOrderItem?.sort_order ?? 0) + 1;

    const { error } = await supabase
      .from("tensions")
      .update({
        area_id: areaId,
        sort_order: newSortOrder,
      })
      .eq("id", tensionId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "saveFailed" };
    }

    await recordChartHistory(projectId, "tension", tensionId, "updated", "area_id", oldAreaId ?? null, areaId ?? null);

    if (updateChildActions) {
      const { error: actionsError } = await supabase
        .from("actions")
        .update({ area_id: areaId })
        .eq("tension_id", tensionId);

      if (actionsError) {
        console.warn("⚠️ Failed to update child actions:", actionsError);
      }

      try {
        const { data: childActions, error: childActionsError } = await supabase
          .from("actions")
          .select("child_chart_id")
          .eq("tension_id", tensionId)
          .not("child_chart_id", "is", null);

        if (childActionsError) {
          console.warn("⚠️ Failed to fetch child charts:", childActionsError);
        } else {
          const childChartIds = (childActions || [])
            .map((action) => action.child_chart_id)
            .filter((id): id is string => !!id);

          if (childChartIds.length > 0) {
            const { error: visionError } = await supabase
              .from("visions")
              .update({ area_id: areaId, updated_at: new Date().toISOString() })
              .in("chart_id", childChartIds);

            if (visionError) {
              console.warn("⚠️ Failed to update child visions:", visionError);
            } else {
              for (const childChartId of childChartIds) {
                await revalidateChartPath(childChartId);
              }
            }
          }
        }
      } catch (syncError) {
        console.error("⚠️ Failed to sync child visions:", syncError);
      }
    }

    await revalidateChartPath(projectId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

// Area移動: Action
export async function updateActionArea(
  actionId: string,
  areaId: string | null,
  projectId: string,
  removeFromTension: boolean = false
) {
  try {
    const supabase = await createClient();
    const { data: actionMeta, error: actionMetaError } = await supabase
      .from("actions")
      .select("child_chart_id, area_id, tension_id")
      .eq("id", actionId)
      .single();
    if (actionMetaError) {
      console.warn("[DEBUG] Failed to fetch action child_chart_id:", actionMetaError);
    } else {
    }
    let maxOrderQuery: any = supabase
      .from("actions")
      .select("sort_order")
      .eq("chart_id", projectId)
      .is("due_date", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (areaId === null) {
      maxOrderQuery = maxOrderQuery.is("area_id", null);
    } else {
      maxOrderQuery = maxOrderQuery.eq("area_id", areaId);
    }

    const { data: maxOrderItem, error: maxOrderError } = await maxOrderQuery;

    if (maxOrderError) throw maxOrderError;

    const newSortOrder = (maxOrderItem?.sort_order ?? 0) + 1;

    const updateData: { area_id: string | null; sort_order: number; tension_id?: null } = {
      area_id: areaId,
      sort_order: newSortOrder,
    };
    if (removeFromTension) {
      updateData.tension_id = null;
    }

    const { error } = await supabase.from("actions").update(updateData).eq("id", actionId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "saveFailed" };
    }

    const oldAreaId = actionMeta?.area_id ?? null;
    await recordChartHistory(projectId, "action", actionId, "updated", "area_id", oldAreaId ?? null, areaId ?? null);

    if (actionMeta?.child_chart_id) {
      try {
        if (areaId === null) {
          const { error: clearError } = await supabase
            .from("visions")
            .update({ area_id: null, updated_at: new Date().toISOString() })
            .eq("chart_id", actionMeta.child_chart_id);
          if (clearError) {
            console.warn("⚠️ Failed to clear child vision area:", clearError);
          }
        } else {
          const { data: parentArea, error: parentAreaError } = await supabase
            .from("areas")
            .select("name, color")
            .eq("id", areaId)
            .single();
          if (parentAreaError || !parentArea) {
            console.warn("⚠️ Failed to fetch parent area:", parentAreaError);
          } else {
            const { data: childArea, error: childAreaError } = await supabase
              .from("areas")
              .select("id")
              .eq("chart_id", actionMeta.child_chart_id)
              .eq("name", parentArea.name)
              .eq("color", parentArea.color)
              .single();
            if (childAreaError || !childArea) {
              console.warn("⚠️ No matching child area found:", childAreaError);
            } else {
              const { error: syncError } = await supabase
                .from("visions")
                .update({ area_id: childArea.id, updated_at: new Date().toISOString() })
                .eq("chart_id", actionMeta.child_chart_id);
              if (syncError) {
                console.warn("⚠️ Failed to sync child visions:", syncError);
              }
            }
          }
        }
      } catch (syncError) {
        console.warn("⚠️ Failed to sync child vision area:", syncError);
      }
    }

    await revalidateChartPath(projectId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function moveActionToTension(
  actionId: string,
  tensionId: string,
  chartId: string
) {
  try {
    const supabase = await createClient();
    const { data: actionBefore } = await supabase
      .from("actions")
      .select("tension_id")
      .eq("id", actionId)
      .single();
    const fromTensionId = actionBefore?.tension_id ?? null;

    const { data: tension, error: tensionError } = await supabase
      .from("tensions")
      .select("area_id")
      .eq("id", tensionId)
      .single();
    if (tensionError) {
      console.warn("⚠️ Failed to fetch tension area:", tensionError);
    }
    const { error } = await supabase
      .from("actions")
      .update({ tension_id: tensionId, area_id: tension?.area_id ?? null })
      .eq("id", actionId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "saveFailed" };
    }

    await recordChartHistory(chartId, "action", actionId, "moved", "tension_id", fromTensionId ?? null, tensionId ?? null);
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

/** Action を loose（未割り当て）に移動 */
export async function moveActionToLoose(
  actionId: string,
  chartId: string
) {
  try {
    const supabase = await createClient();
    const { data: actionBefore } = await supabase
      .from("actions")
      .select("tension_id")
      .eq("id", actionId)
      .single();
    const fromTensionId = actionBefore?.tension_id ?? null;

    const { error } = await supabase
      .from("actions")
      .update({ tension_id: null })
      .eq("id", actionId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "saveFailed" };
    }

    await recordChartHistory(chartId, "action", actionId, "moved", "tension_id", fromTensionId ?? null, null);
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function fetchActionComments(actionId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("action_comments")
      .select(
        "*, profile:profiles(id, email, name, avatar_url)"
      )
      .eq("action_id", actionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Supabase fetch error:", error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("❌ Server action error:", error);
    return [];
  }
}

async function recordItemRelationsFromMentions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chartId: string,
  sourceType: "action" | "vision" | "reality",
  sourceId: string,
  content: string
) {
  const mentions = parseMentionsFromHtml(content);
  const validTypes = ["action", "vision", "reality", "tension"];
  for (const m of mentions) {
    if (!validTypes.includes(m.type) || m.chartId !== chartId) continue;
    if (m.type === sourceType && m.id === sourceId) continue;
    if (m.id === sourceId) continue;
    try {
      await supabase.from("item_relations").upsert(
        {
          chart_id: chartId,
          source_item_type: sourceType,
          source_item_id: sourceId,
          target_item_type: m.type,
          target_item_id: m.id,
        },
        {
          onConflict: "source_item_type,source_item_id,target_item_type,target_item_id",
          ignoreDuplicates: true,
        }
      );
    } catch (e) {
      console.error("[recordItemRelations] insert error:", e);
    }
  }
}

export async function createComment(actionId: string, content: string, chartId: string) {
  const supabase = await createClient();
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    console.error("[createComment] Auth Error:", error);
    return { success: false, error: "authRequired" };
  }
  try {
    const { data: inserted, error } = await supabase
      .from("action_comments")
      .insert({
        action_id: actionId,
        user_id: user.id,
        content: content.trim(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { success: false, error: "saveFailed" };
    }

    if (inserted) {
      await recordChartHistory(chartId, "comment", inserted.id, "created", "action", actionId, content);
      await recordItemRelationsFromMentions(supabase, chartId, "action", actionId, content);
    }
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function checkIncompleteTelescopeActions(actionId: string): Promise<{
  hasIncomplete: boolean;
  incompleteCount: number;
  incompleteActions: { id: string; title: string; status: string }[];
}> {
  const supabase = await createClient();

  const { data: action, error: actionError } = await supabase
    .from("actions")
    .select("child_chart_id")
    .eq("id", actionId)
    .single();

  if (actionError || !action?.child_chart_id) {
    return { hasIncomplete: false, incompleteCount: 0, incompleteActions: [] };
  }

  const incompleteActions = await getIncompleteActionsRecursive(
    supabase,
    action.child_chart_id
  );

  return {
    hasIncomplete: incompleteActions.length > 0,
    incompleteCount: incompleteActions.length,
    incompleteActions: incompleteActions.slice(0, 5),
  };
}

async function getIncompleteActionsRecursive(
  supabase: any,
  chartId: string
): Promise<{ id: string; title: string; status: string }[]> {
  const result: { id: string; title: string; status: string }[] = [];

  const { data: actions, error: actionsError } = await supabase
    .from("actions")
    .select("id, title, status, is_completed, child_chart_id")
    .eq("chart_id", chartId);

  if (actionsError) {
    console.error("[getIncompleteActionsRecursive] actions fetch error", actionsError);
    return result;
  }

  for (const action of actions || []) {
    const effectiveStatus = action.status || "todo";
    const isIncomplete =
      effectiveStatus !== "done" &&
      effectiveStatus !== "canceled" &&
      !action.is_completed;

    if (isIncomplete) {
      result.push({
        id: action.id,
        title: action.title || "(無題)",
        status: effectiveStatus,
      });
    }

    if (action.child_chart_id) {
      const childIncomplete = await getIncompleteActionsRecursive(
        supabase,
        action.child_chart_id
      );
      result.push(...childIncomplete);
    }
  }

  return result;
}

export async function updateComment(
  commentId: string,
  newContent: string,
  chartId: string
) {
  const supabase = await createClient();
  // TODO: 認証実装後にユーザー確認を復活
  try {
    const { error } = await supabase
      .from("action_comments")
      .update({ content: newContent.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId);
    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "updateFailed" };
    }
    await recordChartHistory(chartId, "comment", commentId, "updated", "action", null, newContent);
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function deleteComment(commentId: string, chartId: string) {
  const supabase = await createClient();
  // TODO: 認証実装後にユーザー確認を復活
  try {
    await recordChartHistory(chartId, "comment", commentId, "deleted", "action");
    const { error: deleteError } = await supabase
      .from("action_comments")
      .delete()
      .eq("id", commentId);
    if (deleteError) {
      console.error("❌ Supabase delete error:", deleteError);
      throw deleteError;
    }
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "deleteFailed",
    };
  }
}

// ============================================
// Vision Comments
// ============================================
export async function fetchVisionComments(visionId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vision_comments")
      .select("*, profile:profiles(id, email, name, avatar_url)")
      .eq("vision_id", visionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Supabase fetch error:", error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("❌ Server action error:", error);
    return [];
  }
}

export async function createVisionComment(
  visionId: string,
  content: string,
  chartId: string
) {
  const supabase = await createClient();
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    console.error("[createVisionComment] Auth Error:", error);
    return { success: false, error: "authRequired" };
  }
  try {
    const { data: inserted, error } = await supabase
      .from("vision_comments")
      .insert({
        vision_id: visionId,
        user_id: user.id,
        content: content.trim(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { success: false, error: "saveFailed" };
    }

    if (inserted) {
      await recordChartHistory(chartId, "comment", inserted.id, "created", "vision", visionId, content);
      await recordItemRelationsFromMentions(supabase, chartId, "vision", visionId, content);
    }
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function updateVisionComment(
  commentId: string,
  newContent: string,
  chartId: string
) {
  const supabase = await createClient();
  // TODO: 認証実装後にユーザー確認を復活
  try {
    const { error } = await supabase
      .from("vision_comments")
      .update({ content: newContent.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId);
    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "updateFailed" };
    }
    await recordChartHistory(chartId, "comment", commentId, "updated", "vision", null, newContent);
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function deleteVisionComment(commentId: string, chartId: string) {
  const supabase = await createClient();
  // TODO: 認証実装後にユーザー確認を復活
  try {
    await recordChartHistory(chartId, "comment", commentId, "deleted", "vision");
    const { error: deleteError } = await supabase
      .from("vision_comments")
      .delete()
      .eq("id", commentId);
    if (deleteError) {
      console.error("❌ Supabase delete error:", deleteError);
      throw deleteError;
    }
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "deleteFailed",
    };
  }
}

// ============================================
// Reality Comments
// ============================================
export async function fetchRealityComments(realityId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reality_comments")
      .select("*, profile:profiles(id, email, name, avatar_url)")
      .eq("reality_id", realityId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Supabase fetch error:", error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("❌ Server action error:", error);
    return [];
  }
}

export async function createRealityComment(
  realityId: string,
  content: string,
  chartId: string
) {
  const supabase = await createClient();
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    console.error("[createRealityComment] Auth Error:", error);
    return { success: false, error: "authRequired" };
  }
  try {
    const { data: inserted, error } = await supabase
      .from("reality_comments")
      .insert({
        reality_id: realityId,
        user_id: user.id,
        content: content.trim(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { success: false, error: "saveFailed" };
    }

    if (inserted) {
      await recordChartHistory(chartId, "comment", inserted.id, "created", "reality", realityId, content);
      await recordItemRelationsFromMentions(supabase, chartId, "reality", realityId, content);
    }
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function updateRealityComment(
  commentId: string,
  newContent: string,
  chartId: string
) {
  const supabase = await createClient();
  // TODO: 認証実装後にユーザー確認を復活
  try {
    const { error } = await supabase
      .from("reality_comments")
      .update({ content: newContent.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId);
    if (error) {
      console.error("❌ Supabase update error:", error);
      return { success: false, error: "updateFailed" };
    }
    await recordChartHistory(chartId, "comment", commentId, "updated", "reality", null, newContent);
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

export async function deleteRealityComment(commentId: string, chartId: string) {
  const supabase = await createClient();
  // TODO: 認証実装後にユーザー確認を復活
  try {
    await recordChartHistory(chartId, "comment", commentId, "deleted", "reality");
    const { error: deleteError } = await supabase
      .from("reality_comments")
      .delete()
      .eq("id", commentId);
    if (deleteError) {
      console.error("❌ Supabase delete error:", deleteError);
      throw deleteError;
    }
    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("❌ Server action error:", error);
    return {
      success: false,
      error: "deleteFailed",
    };
  }
}

// Chart操作
export async function updateChartTitle(chartId: string, title: string) {
  return await updateChart(chartId, { title });
}

// Chart更新（タイトル、概要、期限）
export async function updateChartData(
  chartId: string,
  data: { title?: string; description?: string | null; due_date?: Date | string | null }
) {
  const result = await updateChart(chartId, data);
  if (result) {
    await revalidateChartPath(chartId);
  } else {
    console.error("[updateChartData] 更新失敗");
  }
  return result;
}

// Chart status更新
export async function updateChartStatusAction(
  chartId: string,
  status: ChartStatus
): Promise<{ error?: string }> {
  const result = await updateChartStatus(chartId, status);
  if (!result.error) {
    await revalidateChartPath(chartId);

    // 子チャートが完了/中止になったら、親Actionのステータスも同期する
    if (status === "completed") {
      try {
        const supabase = await createClient();
        // このチャートの parent_action_id を取得
        const { data: chart } = await supabase
          .from("charts")
          .select("parent_action_id")
          .eq("id", chartId)
          .single();

        if (chart?.parent_action_id) {
          // 親Actionを完了にする
          await supabase
            .from("actions")
            .update({
              status: "done",
              is_completed: true,
            })
            .eq("id", chart.parent_action_id);

          // 親Actionが属するチャートのパスもrevalidate
          const { data: parentAction } = await supabase
            .from("actions")
            .select("chart_id")
            .eq("id", chart.parent_action_id)
            .single();

          if (parentAction?.chart_id) {
            await revalidateChartPath(parentAction.chart_id);
          }
        }
      } catch (error) {
        console.error("[updateChartStatusAction] 親Action更新エラー:", error);
        // 親Action更新失敗はチャートステータス更新自体には影響させない
      }
    }

    // チャートが未完了に戻された場合、親Actionも未完了に戻す
    if (status === "active") {
      try {
        const supabase = await createClient();
        const { data: chart } = await supabase
          .from("charts")
          .select("parent_action_id")
          .eq("id", chartId)
          .single();

        if (chart?.parent_action_id) {
          await supabase
            .from("actions")
            .update({
              status: "in_progress",
              is_completed: false,
            })
            .eq("id", chart.parent_action_id);

          const { data: parentAction } = await supabase
            .from("actions")
            .select("chart_id")
            .eq("id", chart.parent_action_id)
            .single();

          if (parentAction?.chart_id) {
            await revalidateChartPath(parentAction.chart_id);
          }
        }
      } catch (error) {
        console.error("[updateChartStatusAction] 親Action復元エラー:", error);
      }
    }
  }
  return result;
}

// テレスコーピング: アクションから子チャートを作成または取得
export async function telescopeActionPlan(
  actionId: string,
  tensionId: string | null,
  chartId?: string
): Promise<string | null> {
  try {
    const result = await telescopeAction(actionId, tensionId, chartId);
    return result;
  } catch (error) {
    console.error("[Server] telescopeActionPlan error:", error);
    return null;
  }
}

// 子チャートの進捗情報を取得
export async function getActionProgress(childChartId: string) {
  return await getChildChartProgress(childChartId);
}

// スナップショット作成
async function getChartDataRecursive(
  chartId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  visited: Set<string>
): Promise<any> {
  if (visited.has(chartId)) {
    return null;
  }
  visited.add(chartId);

  const { data: chart } = await supabase
    .from("charts")
    .select("*")
    .eq("id", chartId)
    .single();

  if (!chart) return null;

  const [areasResult, visionsResult, realitiesResult, tensionsResult, actionsResult] =
    await Promise.all([
      supabase.from("areas").select("*").eq("chart_id", chartId),
      supabase.from("visions").select("*").eq("chart_id", chartId),
      supabase.from("realities").select("*").eq("chart_id", chartId),
      supabase.from("tensions").select("*").eq("chart_id", chartId),
      supabase.from("actions").select("*").eq("chart_id", chartId),
    ]);

  const areas = areasResult.data || [];
  const visions = visionsResult.data || [];
  const realities = realitiesResult.data || [];
  const tensions = tensionsResult.data || [];
  const actions = actionsResult.data || [];

  const tensionIds = tensions.map((t: any) => t.id);
  const [tensionVisionsResult, tensionRealitiesResult] = await Promise.all([
    tensionIds.length > 0
      ? supabase.from("tension_visions").select("*").in("tension_id", tensionIds)
      : Promise.resolve({ data: [] }),
    tensionIds.length > 0
      ? supabase.from("tension_realities").select("*").in("tension_id", tensionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const visionIds = visions.map((v: any) => v.id);
  const realityIds = realities.map((r: any) => r.id);
  const actionIds = actions.map((a: any) => a.id);

  const [visionCommentsResult, realityCommentsResult, actionCommentsResult] =
    await Promise.all([
      visionIds.length > 0
        ? supabase.from("vision_comments").select("*").in("vision_id", visionIds)
        : Promise.resolve({ data: [] }),
      realityIds.length > 0
        ? supabase.from("reality_comments").select("*").in("reality_id", realityIds)
        : Promise.resolve({ data: [] }),
      actionIds.length > 0
        ? supabase.from("action_comments").select("*").in("action_id", actionIds)
        : Promise.resolve({ data: [] }),
    ]);

  const childChartIds = [
    ...new Set(actions.map((a: any) => a.child_chart_id).filter(Boolean)),
  ] as string[];

  const children = [];
  for (const childId of childChartIds) {
    const childData: any = await getChartDataRecursive(childId, supabase, visited);
    if (childData) children.push(childData);
  }

  const totalVisions =
    visions.length + children.reduce((sum, child) => sum + (child.metadata?.total_visions || 0), 0);
  const totalActions =
    actions.length + children.reduce((sum, child) => sum + (child.metadata?.total_actions || 0), 0);

  return {
    chart,
    areas,
    visions,
    realities,
    tensions,
    tension_visions: tensionVisionsResult.data || [],
    tension_realities: tensionRealitiesResult.data || [],
    actions,
    comments: {
      visions: visionCommentsResult.data || [],
      realities: realityCommentsResult.data || [],
      actions: actionCommentsResult.data || [],
    },
    children,
    metadata: {
      snapshot_at: new Date().toISOString(),
      total_visions: totalVisions,
      total_actions: totalActions,
      child_charts_count: children.length,
    },
  };
}

export async function createSnapshot(
  chartId: string,
  description?: string,
  type: "manual" | "auto" = "manual"
) {
  try {
    const supabase = await createClient();
    let user;
    try {
      user = await getAuthenticatedUser();
    } catch (error) {
      console.error("[createSnapshot] Auth Error:", error);
      return { success: false, error: "authRequired" };
    }

    const snapshotData = await getChartDataRecursive(chartId, supabase, new Set());
    if (!snapshotData) {
      return { success: false, error: "chartNotFound" };
    }

    const { data: snapshot, error: insertError } = await supabase
      .from("snapshots")
      .insert({
        chart_id: chartId,
        created_by: user.id,
        user_id: user.id,
        data: snapshotData,
        snapshot_type: type,
        description: description || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[createSnapshot] Error inserting snapshot:", insertError);
      return { success: false, error: "saveFailed" };
    }

    await revalidateChartPath(chartId);
    return { success: true, snapshotId: snapshot?.id };
  } catch (error) {
    console.error("[createSnapshot] Exception:", error);
    return {
      success: false,
      error: "error",
    };
  }
}

/** ツリースナップショット作成（マスター＋配下全チャート） */
export async function createTreeSnapshot(
  chartId: string,
  workspaceId: string | null
): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
  try {
    const supabase = await createClient();
    let user;
    try {
      user = await getAuthenticatedUser();
    } catch (error) {
      console.error("[createTreeSnapshot] Auth Error:", error);
      return { success: false, error: "authRequired" };
    }

    const treeData = await collectTreeSnapshotData(chartId, workspaceId, supabase);
    const snapshotId = await saveTreeSnapshot(
      chartId,
      treeData,
      "manual",
      supabase,
      user.id
    );

    if (!snapshotId) {
      return { success: false, error: "saveFailed" };
    }

    await revalidateChartPath(chartId);
    return { success: true, snapshotId };
  } catch (error) {
    console.error("[createTreeSnapshot] Error:", error);
    return { success: false, error: "unknown" };
  }
}

// スナップショット詳細取得
export async function getSnapshotDetail(snapshotId: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (error) {
      console.error("[getSnapshotDetail] Error:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error("[getSnapshotDetail] Exception:", error);
    throw error;
  }
}

export async function updateComparisonDescription(
  comparisonId: string,
  description: string
) {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser();

    const { error } = await supabase
      .from("snapshot_comparisons")
      .update({ description })
      .eq("id", comparisonId);

    if (error) {
      console.error("[updateComparisonDescription] Error:", error);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error("[updateComparisonDescription] Error:", error);
    return { success: false };
  }
}

// Actionステータス更新
export async function updateActionStatus(
  actionId: string,
  newStatus: "todo" | "in_progress" | "done" | "pending" | "canceled"
) {
  try {
    const supabase = await createClient();

    // statusを更新し、doneの場合はis_completedもtrueに、それ以外はfalseに
    const updateData: any = {
      status: newStatus,
      is_completed: newStatus === "done",
    };

    const { error } = await supabase
      .from("actions")
      .update(updateData)
      .eq("id", actionId);

    if (error) {
      console.error("[updateActionStatus] Error:", error);
      throw new Error(error.message);
    }

    return { success: true };
  } catch (error) {
    console.error("[updateActionStatus] Exception:", error);
    throw error;
  }
}

// 履歴取得
export async function fetchItemHistory(
  itemType: "vision" | "reality" | "action",
  itemId: string
): Promise<HistoryItem[]> {
  return await getItemHistory(itemType, itemId);
}

// 履歴追加
export async function addItemHistoryEntry(
  itemType: "vision" | "reality" | "action",
  itemId: string,
  content: string,
  type: "update" | "comment",
  updateMainContent: boolean,
  chartId: string
) {
  const result = await addItemHistory(itemType, itemId, content, type, updateMainContent);
  if (result) {
    await revalidateChartPath(chartId);
  }
  return result;
}

// Linked Resources
export interface ItemLink {
  id: string;
  chart_id: string;
  item_type: string;
  item_id: string;
  url: string;
  title: string | null;
  service: string | null;
  created_at: string;
}

export type ItemRelation = { type: string; id: string; title: string };

async function resolveItemTitles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: { type: string; id: string }[]
): Promise<ItemRelation[]> {
  if (items.length === 0) return [];
  const byType = { vision: [] as string[], reality: [] as string[], tension: [] as string[], action: [] as string[] };
  for (const { type, id } of items) {
    if (type in byType) (byType as Record<string, string[]>)[type].push(id);
  }
  const titleMap = new Map<string, string>();
  const tables: { type: string; table: string; titleCol: string }[] = [
    { type: "vision", table: "visions", titleCol: "content" },
    { type: "reality", table: "realities", titleCol: "content" },
    { type: "tension", table: "tensions", titleCol: "title" },
    { type: "action", table: "actions", titleCol: "title" },
  ];
  await Promise.all(
    tables.map(async ({ type, table, titleCol }) => {
      const ids = (byType as Record<string, string[]>)[type];
      if (!ids?.length) return;
      const { data } = await supabase.from(table).select("id, " + titleCol).in("id", ids);
      for (const r of data ?? []) {
        const row = r as unknown as Record<string, string>;
        titleMap.set(`${type}:${row.id}`, (row[titleCol] || "").slice(0, 200));
      }
    })
  );
  return items.map(({ type, id }) => ({
    type,
    id,
    title: titleMap.get(`${type}:${id}`) ?? "(無題)",
  }));
}

export async function getItemRelations(
  chartId: string,
  itemType: string,
  itemId: string
): Promise<{ references: ItemRelation[]; referencedBy: ItemRelation[] }> {
  try {
    const supabase = await createClient();
    const { data: refs } = await supabase
      .from("item_relations")
      .select("target_item_type, target_item_id")
      .eq("chart_id", chartId)
      .eq("source_item_type", itemType)
      .eq("source_item_id", itemId);
    const { data: refBy } = await supabase
      .from("item_relations")
      .select("source_item_type, source_item_id")
      .eq("chart_id", chartId)
      .eq("target_item_type", itemType)
      .eq("target_item_id", itemId);
    const refItems = (refs ?? []).map((r) => ({ type: (r as { target_item_type: string }).target_item_type, id: (r as { target_item_id: string }).target_item_id }));
    const refByItems = (refBy ?? []).map((r) => ({ type: (r as { source_item_type: string }).source_item_type, id: (r as { source_item_id: string }).source_item_id }));
    const [references, referencedBy] = await Promise.all([
      resolveItemTitles(supabase, refItems),
      resolveItemTitles(supabase, refByItems),
    ]);
    return { references, referencedBy };
  } catch (error) {
    console.error("[getItemRelations] Error:", error);
    return { references: [], referencedBy: [] };
  }
}

// Action Dependencies (blocking/blocked by)
export type ActionDependencyItem = {
  id: string;
  actionId: string;
  title: string;
  status: string | null;
  isCompleted: boolean | null;
};

export async function getActionDependencies(
  chartId: string,
  actionId: string
): Promise<{ blockedBy: ActionDependencyItem[]; blocking: ActionDependencyItem[] }> {
  try {
    const supabase = await createClient();
    const { data: blockedByRows } = await supabase
      .from("action_dependencies")
      .select("id, blocker_action_id")
      .eq("chart_id", chartId)
      .eq("blocked_action_id", actionId);
    const { data: blockingRows } = await supabase
      .from("action_dependencies")
      .select("id, blocked_action_id")
      .eq("chart_id", chartId)
      .eq("blocker_action_id", actionId);

    const blockerIds = (blockedByRows ?? []).map((r) => (r as { blocker_action_id: string }).blocker_action_id);
    const blockedIds = (blockingRows ?? []).map((r) => (r as { blocked_action_id: string }).blocked_action_id);

    const fetchActions = async (ids: string[]) => {
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("actions")
        .select("id, title, status, is_completed")
        .in("id", ids);
      return (data ?? []).map((a) => ({
        id: (a as { id: string }).id,
        title: ((a as { title: string }).title || "").slice(0, 200),
        status: (a as { status: string | null }).status,
        isCompleted: (a as { is_completed: boolean | null }).is_completed,
      }));
    };

    const [blockedByActions, blockingActions] = await Promise.all([
      fetchActions(blockerIds),
      fetchActions(blockedIds),
    ]);

    const blockedBy = blockedByActions.map((a, i) => ({
      ...a,
      depId: (blockedByRows ?? [])[i]?.id ?? "",
      actionId: a.id,
    }));
    const blocking = blockingActions.map((a, i) => ({
      ...a,
      depId: (blockingRows ?? [])[i]?.id ?? "",
      actionId: a.id,
    }));

    return {
      blockedBy: blockedBy.map(({ depId: d, ...rest }) => ({ ...rest, id: d })),
      blocking: blocking.map(({ depId: d, ...rest }) => ({ ...rest, id: d })),
    };
  } catch (error) {
    console.error("[getActionDependencies] Error:", error);
    return { blockedBy: [], blocking: [] };
  }
}

export async function searchChartActions(chartId: string, query: string): Promise<{ id: string; title: string; status: string | null }[]> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("actions")
      .select("id, title, status")
      .eq("chart_id", chartId)
      .order("title");
    if (query.trim()) {
      q = q.ilike("title", `%${query.trim()}%`);
    }
    const { data } = await q.limit(20);
    return (data ?? []).map((a) => ({
      id: (a as { id: string }).id,
      title: ((a as { title: string }).title || "").slice(0, 200),
      status: (a as { status: string | null }).status,
    }));
  } catch (error) {
    console.error("[searchChartActions] Error:", error);
    return [];
  }
}

export async function addActionDependency(
  chartId: string,
  actionId: string,
  relatedActionId: string,
  relationType: "blocked_by" | "blocking"
) {
  try {
    const supabase = await createClient();
    const blocked = relationType === "blocked_by" ? actionId : relatedActionId;
    const blocker = relationType === "blocked_by" ? relatedActionId : actionId;
    if (blocked === blocker) throw new Error("Cannot add self-dependency");

    const { error } = await supabase.from("action_dependencies").insert({
      chart_id: chartId,
      blocked_action_id: blocked,
      blocker_action_id: blocker,
    });

    if (error) throw new Error(error.message);

    const { data: relatedAction } = await supabase
      .from("actions")
      .select("title")
      .eq("id", relatedActionId)
      .single();
    const relatedTitle = (relatedAction as { title?: string } | null)?.title?.trim() || "(無題)";
    const displayValue =
      relationType === "blocked_by"
        ? `Blocked by: ${relatedTitle}`
        : `Blocking: ${relatedTitle}`;
    await recordChartHistory(chartId, "action", actionId, "updated", "dependency", null, displayValue);

    await revalidateChartPath(chartId);
    return { success: true };
  } catch (error) {
    console.error("[addActionDependency] Error:", error);
    throw error;
  }
}

export async function removeActionDependency(dependencyId: string, actionId: string) {
  try {
    const supabase = await createClient();
    const { data: dep } = await supabase
      .from("action_dependencies")
      .select("chart_id, blocked_action_id, blocker_action_id")
      .eq("id", dependencyId)
      .single();

    let displayValue: string | null = null;
    if (dep?.chart_id) {
      const blockedId = (dep as { blocked_action_id?: string }).blocked_action_id;
      const blockerId = (dep as { blocker_action_id?: string }).blocker_action_id;
      const otherId = actionId === blockedId ? blockerId : blockedId;
      const { data: otherAction } = await supabase
        .from("actions")
        .select("title")
        .eq("id", otherId)
        .single();
      const otherTitle = (otherAction as { title?: string } | null)?.title?.trim() || "(無題)";
      displayValue = actionId === blockedId ? `Blocked by: ${otherTitle}` : `Blocking: ${otherTitle}`;
      await recordChartHistory(dep.chart_id, "action", actionId, "updated", "dependency", displayValue, null);
    }

    const { error } = await supabase.from("action_dependencies").delete().eq("id", dependencyId);
    if (error) throw new Error(error.message);

    if (dep?.chart_id) {
      await revalidateChartPath(dep.chart_id);
    }
    return { success: true };
  } catch (error) {
    console.error("[removeActionDependency] Error:", error);
    throw error;
  }
}

export async function getItemLinks(
  itemType: string,
  itemId: string
): Promise<ItemLink[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("item_links")
      .select("id, chart_id, item_type, item_id, url, title, service, created_at")
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getItemLinks] Error:", error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("[getItemLinks] Exception:", error);
    return [];
  }
}

export async function addItemLink(
  chartId: string,
  itemType: string,
  itemId: string,
  url: string,
  title?: string
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const service = detectService(url);

    const { data, error } = await supabase
      .from("item_links")
      .insert({
        chart_id: chartId,
        item_type: itemType,
        item_id: itemId,
        url: url.trim(),
        title: title?.trim() || null,
        service,
        created_by: user.id,
      })
      .select("id, chart_id, item_type, item_id, url, title, service, created_at")
      .single();

    if (error) {
      console.error("[addItemLink] Error:", error);
      throw new Error(error.message);
    }

    const entityType = itemType as "vision" | "reality" | "tension" | "action";
    const linkDisplayValue = `${SERVICE_LABELS[service]} ${url.trim()}`;
    await recordChartHistory(chartId, entityType, itemId, "updated", "link", null, linkDisplayValue);

    await revalidateChartPath(chartId);
    return data;
  } catch (error) {
    console.error("[addItemLink] Exception:", error);
    throw error;
  }
}

export async function deleteItemLink(linkId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: link } = await supabase
      .from("item_links")
      .select("chart_id, item_type, item_id, url, service")
      .eq("id", linkId)
      .single();

    const { error } = await supabase
      .from("item_links")
      .delete()
      .eq("id", linkId)
      .eq("created_by", user.id);

    if (error) {
      console.error("[deleteItemLink] Error:", error);
      throw new Error(error.message);
    }

    if (link?.chart_id) {
      const entityType = (link as { item_type?: string }).item_type as "vision" | "reality" | "tension" | "action";
      const url = (link as { url?: string }).url ?? "";
      const service = (link as { service?: string }).service ?? "other";
      const linkDisplayValue = `${SERVICE_LABELS[service as keyof typeof SERVICE_LABELS]} ${url}`;
      await recordChartHistory(
        link.chart_id,
        entityType,
        (link as { item_id?: string }).item_id ?? "",
        "updated",
        "link",
        linkDisplayValue,
        null
      );
      await revalidateChartPath(link.chart_id);
    }
    return { success: true };
  } catch (error) {
    console.error("[deleteItemLink] Exception:", error);
    throw error;
  }
}

