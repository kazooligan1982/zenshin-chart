import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Row returned from actions query with optional joined data */
interface ActionRow {
  id: string;
  title: string;
  content: string | null;
  description: string | null;
  due_date: string | null;
  assignee: string | null;
  status: string | null;
  is_completed: boolean | null;
  tension_id: string | null;
  child_chart_id: string | null;
}

interface ActionWithHierarchy {
  id: string;
  title: string;
  content: string | null;
  description?: string | null;
  due_date: string | null;
  assignee: string | null;
  status: string | null;
  is_completed: boolean | null;
  tension_id: string | null;
  child_chart_id: string | null;
  depth: number;
  parent_action_id: string | null;
  tension_title: string | null;
  tension_area_name: string | null;
  tension_area_color: string | null;
  vision_title: string | null;
  has_children: boolean;
  vision_tags?: string[];
}

async function getVisionTagMap(
  supabase: SupabaseClient,
  chartId: string,
  tensionIds: string[]
) {
  if (tensionIds.length === 0) {
    return {
      tensionVisions: [],
      visionIndexMap: new Map<string, number>(),
    };
  }

  const [tensionVisionsRes, visionsRes] = await Promise.all([
    supabase
      .from("tension_visions")
      .select("tension_id, vision_id")
      .in("tension_id", tensionIds),
    supabase
      .from("visions")
      .select("id, content")
      .eq("chart_id", chartId)
      .order("created_at", { ascending: true }),
  ]);
  const tensionVisions = tensionVisionsRes.data;
  const visions = visionsRes.data;

  const visionIndexMap = new Map<string, number>();
  const visionContentMap = new Map<string, string>();
  visions?.forEach((v: { id: string; content: string | null }, index: number) => {
    visionIndexMap.set(v.id, index + 1);
    if (v.content) {
      visionContentMap.set(v.id, v.content);
    }
  });

  const tensionVisionTitleMap = new Map<string, string>();
  tensionIds.forEach((tensionId) => {
    const related = (tensionVisions || [])
      .filter((tv: { tension_id: string; vision_id: string }) => tv.tension_id === tensionId)
      .map((tv: { tension_id: string; vision_id: string }) => ({
        visionId: tv.vision_id,
        index: visionIndexMap.get(tv.vision_id) || Number.MAX_SAFE_INTEGER,
      }))
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index);
    const first = related[0];
    if (first) {
      const title = visionContentMap.get(first.visionId);
      if (title) {
        tensionVisionTitleMap.set(tensionId, title);
      }
    }
  });

  return {
    tensionVisions: tensionVisions || [],
    visionIndexMap,
    tensionVisionTitleMap,
  };
}

async function getActionsWithHierarchy(
  supabase: SupabaseClient,
  chartId: string,
  depth: number = 0,
  parentActionId: string | null = null,
  tensionInfo: {
    title: string | null;
    areaName: string | null;
    areaColor: string | null;
    visionTitle: string | null;
  } | null = null
): Promise<ActionWithHierarchy[]> {
  const results: ActionWithHierarchy[] = [];

  const { data: tensions } = await supabase
    .from("tensions")
    .select("id, title, description, area_id, status, areas (name, color)")
    .eq("chart_id", chartId)
    .order("created_at", { ascending: true });

  const activeTensions = (tensions || []).filter(
    (t: { status?: string }) => t.status !== "resolved"
  );

  const tensionIds = activeTensions.map((t: { id: string }) => t.id);
  const { tensionVisions, visionIndexMap, tensionVisionTitleMap } =
    await getVisionTagMap(supabase, chartId, tensionIds);

  if (!tensions || tensions.length === 0) {
    const { data: actions } = await supabase
      .from("actions")
      .select("*")
      .eq("chart_id", chartId)
      .order("created_at", { ascending: true });

    const actionsList = actions || [];
    const actionsWithChildren = actionsList.filter(
      (a: ActionRow) => a.child_chart_id
    );
    const childResults = await Promise.all(
      actionsWithChildren.map((a: ActionRow) =>
        getActionsWithHierarchy(
          supabase,
          a.child_chart_id!,
          depth + 1,
          a.id,
          tensionInfo
        )
      )
    );
    const childMap = new Map<string, ActionWithHierarchy[]>();
    actionsWithChildren.forEach((a: ActionRow, i: number) => {
      childMap.set(a.id, childResults[i]);
    });

    for (const action of actionsList) {
      results.push({
        id: action.id,
        title: action.title || action.content || "(無題)",
        content: action.content,
        description: action.description ?? action.content ?? null,
        due_date: action.due_date,
        assignee: action.assignee,
        status: action.status,
        is_completed: action.is_completed,
        tension_id: action.tension_id,
        child_chart_id: action.child_chart_id,
        depth,
        parent_action_id: parentActionId,
        tension_title: tensionInfo?.title || null,
        tension_area_name: tensionInfo?.areaName || null,
        tension_area_color: tensionInfo?.areaColor || null,
        vision_title: tensionInfo?.visionTitle || null,
        has_children: !!action.child_chart_id,
      });
      if (action.child_chart_id) {
        results.push(...(childMap.get(action.id) || []));
      }
    }

    return results;
  }

  const tensionActionResults = await Promise.all(
    activeTensions.map((tension: { id: string }) =>
      supabase
        .from("actions")
        .select("*")
        .eq("tension_id", tension.id)
        .order("created_at", { ascending: true })
    )
  );

  for (let i = 0; i < activeTensions.length; i++) {
    const tension = activeTensions[i];
    const { data: actions } = tensionActionResults[i];
    const actionsList = actions || [];
    const tensionAreas = tension.areas as unknown as { name?: string; color?: string } | null;
    const currentTensionInfo = {
      title: tension.title || tension.description || null,
      areaName: tensionAreas?.name || null,
      areaColor: tensionAreas?.color || null,
      visionTitle: tensionVisionTitleMap?.get(tension.id) || null,
    };

    const actionsWithChildren = actionsList.filter(
      (a: ActionRow) => a.child_chart_id
    );
    const childResults = await Promise.all(
      actionsWithChildren.map((a: ActionRow) =>
        getActionsWithHierarchy(
          supabase,
          a.child_chart_id!,
          depth + 1,
          a.id,
          currentTensionInfo
        )
      )
    );
    const childMap = new Map<string, ActionWithHierarchy[]>();
    actionsWithChildren.forEach((a: ActionRow, idx: number) => {
      childMap.set(a.id, childResults[idx]);
    });

    for (const action of actionsList) {
      const relatedVisions = tensionVisions
        .filter((tv: { tension_id: string; vision_id: string }) => tv.tension_id === action.tension_id)
        .map((tv: { tension_id: string; vision_id: string }) => {
          const index = visionIndexMap.get(tv.vision_id);
          return index ? `V-${String(index).padStart(2, "0")}` : null;
        })
        .filter((tag: string | null): tag is string => tag !== null);

      results.push({
        id: action.id,
        title: action.title || action.content || "(無題)",
        content: action.content,
        description: action.description ?? action.content ?? null,
        due_date: action.due_date,
        assignee: action.assignee,
        status: action.status,
        is_completed: action.is_completed,
        tension_id: tension.id,
        child_chart_id: action.child_chart_id,
        depth,
        parent_action_id: parentActionId,
        tension_title: currentTensionInfo.title,
        tension_area_name: currentTensionInfo.areaName,
        tension_area_color: currentTensionInfo.areaColor,
        vision_title: currentTensionInfo.visionTitle,
        has_children: !!action.child_chart_id,
        vision_tags: relatedVisions,
      });
      if (action.child_chart_id) {
        results.push(...(childMap.get(action.id) || []));
      }
    }
  }

  return results;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();

    const actions = await getActionsWithHierarchy(supabase, projectId);

    return NextResponse.json(actions);
  } catch (error) {
    logger.error("Error in GET /api/charts/[id]/actions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// モーダル内の自動保存用（revalidatePath を呼ばない）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chartId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { actionId, tensionId: _tensionId, field, value } = body as {
      actionId: string;
      tensionId: string | null;
      field: "status" | "title" | "assignee" | "dueDate" | "description";
      value: string | null;
    };

    if (!actionId || !field) {
      return NextResponse.json(
        { error: "actionId and field are required" },
        { status: 400 }
      );
    }

    // 履歴記録用: 更新前の値を取得
    const { data: currentAction } = await supabase
      .from("actions")
      .select("title, status, assignee, due_date, description, tension_id, area_id")
      .eq("id", actionId)
      .single();

    const fieldToColumn: Record<string, string> = {
      title: "title",
      status: "status",
      assignee: "assignee",
      dueDate: "due_date",
      description: "description",
    };

    const getOldValue = (f: string): string | null => {
      if (!currentAction) return null;
      const col = fieldToColumn[f] || f;
      const val = (currentAction as Record<string, unknown>)[col];
      return val === undefined || val === null ? null : String(val);
    };

    const recordHistory = async (
      eventType: string,
      historyField: string | null,
      oldVal: string | null,
      newVal: string | null
    ) => {
      const { error: histError } = await supabase.from("chart_history").insert({
        chart_id: chartId,
        entity_type: "action",
        entity_id: actionId,
        event_type: eventType,
        field: historyField,
        old_value: oldVal,
        new_value: newVal,
        user_id: user.id,
      });
      if (histError) {
        logger.error("[chart_history] insert error:", histError);
      }
    };

    if (field === "status") {
      const validStatuses = ["todo", "in_progress", "done", "pending", "canceled"];
      if (!value || !validStatuses.includes(value)) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 }
        );
      }
      const updateData: Record<string, unknown> = {
        status: value,
        is_completed: value === "done",
      };
      const { error } = await supabase
        .from("actions")
        .update(updateData)
        .eq("id", actionId);

      if (error) {
        logger.error("[PATCH actions] status update error:", error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
      const eventType = value === "done" ? "completed" : "updated";
      await recordHistory(eventType, "status", getOldValue("status"), value);
      return NextResponse.json({ success: true });
    }

    if (field === "description") {
      const descValue = value === "" || value === null ? null : value;
      const { error: descError } = await supabase
        .from("actions")
        .update({ description: descValue })
        .eq("id", actionId);
      if (descError) {
        return NextResponse.json(
          { error: descError.message },
          { status: 500 }
        );
      }
      await recordHistory("updated", "description", getOldValue("description"), descValue);
      return NextResponse.json({ success: true });
    }

    // title, assignee, dueDate（actionId はテーブル全体で一意のため追加条件不要）
    const updates: Record<string, unknown> = {};
    if (field === "title") updates.title = value ?? "";
    if (field === "assignee") updates.assignee = value;
    if (field === "dueDate") updates.due_date = value;

    const { error } = await supabase
      .from("actions")
      .update(updates)
      .eq("id", actionId);
    if (error) {
      logger.error("[PATCH actions] update error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // dueDate の場合は child_chart の due_date も更新
    if (field === "dueDate") {
      const { data: action } = await supabase
        .from("actions")
        .select("child_chart_id")
        .eq("id", actionId)
        .single();
      if (action?.child_chart_id) {
        await supabase
          .from("charts")
          .update({ due_date: value })
          .eq("id", action.child_chart_id);
      }
    }

    const dbField = fieldToColumn[field] || field;
    await recordHistory("updated", dbField, getOldValue(field), value ?? null);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error in PATCH /api/charts/[id]/actions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

