import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface TreeNode {
  id: string;
  type: "tension" | "action";
  title: string;
  status?: string | null;
  assignee?: string | null;
  due_date?: string | null;
  tension_id?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  area_color?: string | null;
  is_completed?: boolean | null;
  child_chart_id?: string | null;
  description?: string | null;
  children: TreeNode[];
}

async function findRootChartIdSimple(
  supabase: SupabaseClient,
  chartId: string
): Promise<string> {
  let currentId = chartId;
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    const { data: parentAction } = await supabase
      .from("actions")
      .select(
        `
        id,
        tension_id,
        tensions!inner(chart_id)
      `
      )
      .eq("child_chart_id", currentId)
      .limit(1)
      .single();

    const tensionData = parentAction?.tensions as unknown as { chart_id: string } | null;
    if (!parentAction || !tensionData?.chart_id) {
      break;
    }

    currentId = tensionData.chart_id;
    iterations++;
  }

  return currentId;
}

async function getTensionsWithActions(
  supabase: SupabaseClient,
  chartId: string
): Promise<TreeNode[]> {
  const { data: tensions, error: tensionError } = await supabase
    .from("tensions")
    .select(
      "id, title, description, area_id, status, areas (id, name, color)"
    )
    .eq("chart_id", chartId)
    .order("created_at", { ascending: true });

  const activeTensions = (tensions || []).filter(
    (t: { status?: string }) => t.status !== "resolved"
  );

  if (tensionError) {
    console.error(`[getTensionsWithActions] Tension error:`, tensionError);
  }

  if (!activeTensions || activeTensions.length === 0) {
    const { data: actions, error: actionError } = await supabase
      .from("actions")
      .select(
        "id, title, description, due_date, assignee, status, is_completed, child_chart_id, tension_id"
      )
      .eq("chart_id", chartId)
      .order("created_at", { ascending: true });

    if (actionError) {
      console.error(`[getTensionsWithActions] Actions error:`, actionError);
    }

    return (actions || []).map((action: { id: string; title: string; description: string | null; due_date: string | null; assignee: string | null; status: string | null; is_completed: boolean | null; child_chart_id: string | null; tension_id: string | null }) => ({
      id: action.id,
      type: "action" as const,
      title: action.title || action.description || "(無題)",
      status: action.status,
      assignee: action.assignee,
      due_date: action.due_date,
      tension_id: action.tension_id || null,
      is_completed: action.is_completed,
      child_chart_id: action.child_chart_id,
      description: action.description ?? null,
      children: [],
    }));
  }

  const tensionNodes: TreeNode[] = [];

  for (const tension of activeTensions) {
    const { data: actions, error: actionError } = await supabase
      .from("actions")
      .select(
        "id, title, description, due_date, assignee, status, is_completed, child_chart_id, tension_id"
      )
      .eq("tension_id", tension.id)
      .order("created_at", { ascending: true });

    if (actionError) {
      console.error(`[getTensionsWithActions] Actions error:`, actionError);
    }

    const actionNodes: TreeNode[] = [];

    for (const action of actions || []) {
      const actionNode: TreeNode = {
        id: action.id,
        type: "action",
        title: action.title || action.description || "(無題)",
        status: action.status,
        assignee: action.assignee,
        due_date: action.due_date,
        is_completed: action.is_completed,
        tension_id: action.tension_id || null,
        child_chart_id: action.child_chart_id,
        description: action.description ?? null,
        children: [],
      };

      if (action.child_chart_id) {
        actionNode.children = await getTensionsWithActions(
          supabase,
          action.child_chart_id
        );
      }

      actionNodes.push(actionNode);
    }

    tensionNodes.push({
      id: tension.id,
      type: "tension",
      title: tension.title || tension.description || "(無題)",
      area_id: tension.area_id,
      area_name: (tension.areas as unknown as { name?: string } | null)?.name,
      area_color: (tension.areas as unknown as { color?: string } | null)?.color,
      children: actionNodes,
    });
  }

  return tensionNodes;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chartId } = await params;
    const supabase = await createClient();
    const rootChartId = await findRootChartIdSimple(supabase, chartId);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: chart, error: _chartError } = await supabase
      .from("charts")
      .select("id, title")
      .eq("id", rootChartId)
      .single();

    if (!chart) {
      return NextResponse.json({ error: "Chart not found" }, { status: 404 });
    }

    const tree = await getTensionsWithActions(supabase, rootChartId);

    return NextResponse.json({
      chart: {
        id: chart.id,
        name: chart.title || "(無題)",
      },
      tree,
    });
  } catch (error) {
    console.error("[actions-tree] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
