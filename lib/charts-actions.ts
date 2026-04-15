"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { canCreateChart } from "@/lib/permissions";

export type ActionStatusCounts = {
  total: number;
  done: number;
  inProgress: number;
  onHold: number;
  notStarted: number;
  cancelled: number;
};

export type ChartAssignee = {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
};

export type ChartWithMeta = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  parent_action_id: string | null;
  depth: number;
  status?: "active" | "completed";
  actionStatusCounts?: ActionStatusCounts;
  assignees?: ChartAssignee[];
};

export type ProjectGroup = {
  master: ChartWithMeta;
  layers: {
    [depth: number]: ChartWithMeta[];
  };
};

export async function createChart(
  title: string = "無題のチャート",
  workspaceId?: string
): Promise<{ id: string; title: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("認証が必要です");
  }

  const resolvedWorkspaceId = workspaceId ?? (await getOrCreateWorkspace());

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", resolvedWorkspaceId)
    .eq("user_id", user.id)
    .single();

  const role = (member?.role ?? "viewer") as "owner" | "consultant" | "editor" | "viewer";
  if (!canCreateChart(role)) {
    throw new Error("チャートの作成権限がありません");
  }

  const { data, error } = await supabase
    .from("charts")
    .insert({
      title,
      user_id: user.id,
      workspace_id: resolvedWorkspaceId,
    })
    .select()
    .single();

  if (error) {
    console.error("[createChart] Error:", error);
    throw error;
  }

  revalidatePath("/charts");
  revalidatePath(`/workspaces/${resolvedWorkspaceId}/charts`);
  return data;
}

export async function getChartsHierarchy(workspaceId?: string): Promise<{
  projectGroups: ProjectGroup[];
  recentCharts: ChartWithMeta[];
  completedCharts: ChartWithMeta[];
}> {

  const supabase = await createClient();
  const resolvedWorkspaceId = workspaceId ?? (await getOrCreateWorkspace());

  const { data: charts, error } = await supabase
    .from("charts")
    .select("id, title, description, due_date, created_at, updated_at, parent_action_id, status")
    .is("archived_at", null)
    .eq("workspace_id", resolvedWorkspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[getChartsHierarchy] error:", error);
    throw error;
  }

  const { data: actions } = await supabase
    .from("actions")
    .select("id, chart_id, child_chart_id");

  const childToParentChartMap = new Map<string, string>();
  for (const action of actions || []) {
    if (action.child_chart_id && action.chart_id) {
      childToParentChartMap.set(action.child_chart_id, action.chart_id);
    }
  }

  const getChartDepth = (chartId: string, visited = new Set<string>()): number => {
    if (visited.has(chartId)) return 1;
    visited.add(chartId);
    const parentChartId = childToParentChartMap.get(chartId);
    if (!parentChartId) return 1;
    return 1 + getChartDepth(parentChartId, visited);
  };

  const chartsWithDepth: ChartWithMeta[] = (charts || []).map((chart) => ({
    ...chart,
    depth: getChartDepth(chart.id),
    status: (chart as { status?: string }).status === "completed" ? "completed" : "active",
  }));

  const chartIds = chartsWithDepth.map((c) => c.id);
  const [actionStatusByChart, assigneesByChart] = await Promise.all([
    getActionStatusCountsByChart(supabase, chartIds),
    getAssigneesByChart(supabase, chartIds),
  ]);
  for (const chart of chartsWithDepth) {
    chart.actionStatusCounts = actionStatusByChart.get(chart.id) ?? {
      total: 0,
      done: 0,
      inProgress: 0,
      onHold: 0,
      notStarted: 0,
      cancelled: 0,
    };
    chart.assignees = assigneesByChart.get(chart.id) ?? [];
  }

  const activeCharts = chartsWithDepth.filter((chart) => chart.status !== "completed");
  const completedCharts = chartsWithDepth.filter((chart) => chart.status === "completed");
  const masterCharts = activeCharts.filter((chart) => chart.depth === 1);
  const subCharts = activeCharts.filter((chart) => chart.depth > 1);

  const projectGroups: ProjectGroup[] = masterCharts.map((master) => {
    const findDescendants = (parentId: string): ChartWithMeta[] => {
      const children = subCharts.filter((sub) => {
        const subParentChartId = childToParentChartMap.get(sub.id);
        return subParentChartId === parentId;
      });
      const descendants = [...children];
      for (const child of children) {
        descendants.push(...findDescendants(child.id));
      }
      return descendants;
    };

    const descendants = findDescendants(master.id);
    const layers: { [depth: number]: ChartWithMeta[] } = {};
    for (const sub of descendants) {
      if (!layers[sub.depth]) {
        layers[sub.depth] = [];
      }
      layers[sub.depth].push(sub);
    }

    return { master, layers };
  });

  const recentCharts = activeCharts.slice(0, 4);

  return { projectGroups, recentCharts, completedCharts };
}

export async function deleteChart(chartId: string) {
  const supabase = await createClient();
  const allChartIds = await getAllDescendantChartIds(supabase, chartId);
  allChartIds.push(chartId);

  await supabase
    .from("actions")
    .update({ child_chart_id: null, has_sub_chart: false })
    .in("child_chart_id", allChartIds);

  await supabase
    .from("actions")
    .update({ sub_chart_id: null })
    .in("sub_chart_id", allChartIds);

  const { data: chart } = await supabase.from("charts").select("workspace_id").eq("id", chartId).single();

  const { error: deleteError } = await supabase
    .from("charts")
    .delete()
    .eq("id", chartId);
  if (deleteError) {
    console.error("[deleteChart] error:", deleteError);
    throw deleteError;
  }
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/charts");
  if (chart?.workspace_id) {
    revalidatePath(`/workspaces/${chart.workspace_id}/charts`);
  }
  return { success: true };
}

export async function archiveChart(chartId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: chartData } = await supabase.from("charts").select("workspace_id").eq("id", chartId).single();

  const allChartIds = await getAllDescendantChartIds(supabase, chartId);
  allChartIds.push(chartId);

  const { error } = await supabase
    .from("charts")
    .update({ archived_at: now })
    .in("id", allChartIds);

  if (error) {
    console.error("[archiveChart] error:", error);
    throw error;
  }

  await supabase
    .from("actions")
    .update({ child_chart_id: null, has_sub_chart: false })
    .in("child_chart_id", allChartIds);

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/charts");
  if (chartData?.workspace_id) {
    revalidatePath(`/workspaces/${chartData.workspace_id}/charts`);
    revalidatePath(`/workspaces/${chartData.workspace_id}/settings/archive`);
  }

  return { success: true, archivedCount: allChartIds.length };
}

export async function restoreChart(chartId: string) {
  const supabase = await createClient();
  const { data: chart } = await supabase.from("charts").select("workspace_id").eq("id", chartId).single();

  const allChartIds = await getAllDescendantChartIds(supabase, chartId);
  allChartIds.push(chartId);

  const { error } = await supabase
    .from("charts")
    .update({ archived_at: null })
    .in("id", allChartIds);

  if (error) {
    console.error("[restoreChart] error:", error);
    throw error;
  }

  for (const id of allChartIds) {
    const { data: chart } = await supabase
      .from("charts")
      .select("parent_action_id")
      .eq("id", id)
      .single();

    if (chart?.parent_action_id) {
      await supabase
        .from("actions")
        .update({ child_chart_id: id, has_sub_chart: true })
        .eq("id", chart.parent_action_id);
    }
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/charts");
  revalidatePath("/settings/archive");
  if (chart?.workspace_id) {
    revalidatePath(`/workspaces/${chart.workspace_id}/charts`);
    revalidatePath(`/workspaces/${chart.workspace_id}/settings/archive`);
  }

  return { success: true };
}

async function getActionStatusCountsByChart(
  supabase: any,
  chartIds: string[]
): Promise<Map<string, ActionStatusCounts>> {
  const result = new Map<string, ActionStatusCounts>();
  for (const id of chartIds) {
    result.set(id, {
      total: 0,
      done: 0,
      inProgress: 0,
      onHold: 0,
      notStarted: 0,
      cancelled: 0,
    });
  }
  if (chartIds.length === 0) return result;

  const { data: actions } = await supabase
    .from("actions")
    .select("chart_id, status, is_completed")
    .in("chart_id", chartIds);

  for (const action of actions || []) {
    const chartId = action.chart_id;
    if (!chartId || !result.has(chartId)) continue;

    const counts = result.get(chartId)!;
    counts.total++;

    const status = action.status ?? (action.is_completed ? "done" : "todo");
    switch (status) {
      case "done":
        counts.done++;
        break;
      case "in_progress":
        counts.inProgress++;
        break;
      case "pending":
        counts.onHold++;
        break;
      case "todo":
      case "unset":
      default:
        counts.notStarted++;
        break;
      case "canceled":
        counts.cancelled++;
        break;
    }
  }

  return result;
}

async function getAssigneesByChart(
  supabase: any,
  chartIds: string[]
): Promise<Map<string, ChartAssignee[]>> {
  const result = new Map<string, ChartAssignee[]>();
  for (const id of chartIds) {
    result.set(id, []);
  }
  if (chartIds.length === 0) return result;

  const [actionsRes, visionsRes] = await Promise.all([
    supabase.from("actions").select("chart_id, assignee").in("chart_id", chartIds).not("assignee", "is", null),
    supabase.from("visions").select("chart_id, assignee").in("chart_id", chartIds).not("assignee", "is", null),
  ]);

  const assigneeEmailsByChart = new Map<string, Set<string>>();
  for (const chartId of chartIds) {
    assigneeEmailsByChart.set(chartId, new Set());
  }

  for (const action of actionsRes.data || []) {
    if (action.chart_id && action.assignee?.trim()) {
      assigneeEmailsByChart.get(action.chart_id)?.add(action.assignee.trim());
    }
  }
  for (const vision of visionsRes.data || []) {
    if (vision.chart_id && vision.assignee?.trim()) {
      assigneeEmailsByChart.get(vision.chart_id)?.add(vision.assignee.trim());
    }
  }

  const allEmails = new Set<string>();
  for (const emails of assigneeEmailsByChart.values()) {
    emails.forEach((e) => allEmails.add(e));
  }
  if (allEmails.size === 0) return result;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, name, avatar_url")
    .in("email", Array.from(allEmails));

  const profileByEmail = new Map<string, ChartAssignee>();
  for (const p of profiles || []) {
    if (p.email) {
      profileByEmail.set(p.email, {
        id: p.id,
        email: p.email,
        name: p.name,
        avatar_url: p.avatar_url,
      });
    }
  }

  for (const [chartId, emails] of assigneeEmailsByChart) {
    const assignees: ChartAssignee[] = [];
    for (const email of emails) {
      const profile = profileByEmail.get(email);
      if (profile) {
        assignees.push(profile);
      } else {
        assignees.push({ id: email, email, name: undefined, avatar_url: undefined });
      }
    }
    result.set(chartId, assignees);
  }

  return result;
}

async function getAllDescendantChartIds(
  supabase: any,
  chartId: string
): Promise<string[]> {
  const result: string[] = [];
  const { data: actions } = await supabase
    .from("actions")
    .select("child_chart_id")
    .eq("chart_id", chartId)
    .not("child_chart_id", "is", null);

  for (const action of actions || []) {
    if (action.child_chart_id) {
      result.push(action.child_chart_id);
      const descendants = await getAllDescendantChartIds(
        supabase,
        action.child_chart_id
      );
      result.push(...descendants);
    }
  }

  return result;
}

export async function getArchivedCharts(workspaceId?: string) {
  const supabase = await createClient();
  const resolvedWorkspaceId = workspaceId ?? (await getOrCreateWorkspace());
  const { data: charts, error } = await supabase
    .from("charts")
    .select("id, title, description, archived_at, created_at, updated_at, parent_action_id")
    .not("archived_at", "is", null)
    .eq("workspace_id", resolvedWorkspaceId)
    .order("archived_at", { ascending: false });

  if (error) {
    console.error("[getArchivedCharts] error:", error);
    throw error;
  }

  return charts || [];
}
