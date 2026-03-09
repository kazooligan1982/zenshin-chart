"use server";

import { createClient } from "@/lib/supabase/server";
import { calculateMomentumScore, type MomentumScoreResult } from "@/lib/momentum-score";
import { getPeriodRange } from "./utils";

function getMondayOfWeek(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

export type MomentumData = {
  chartId: string;
  chartTitle: string;
  score: number;
  scoreDisplay: number;
  prevScore: number | null;
  diff: number | null;
  aiInsight: string | null;
  details: MomentumScoreResult["details"];
};

export async function getMomentumData(
  workspaceId: string,
  chartId: string | null
): Promise<MomentumData | null> {
  const supabase = await createClient();
  let targetChartId: string;
  if (!chartId || chartId === "all") {
    const { data: masters } = await supabase
      .from("charts")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .is("parent_action_id", null)
      .order("title")
      .limit(1);
    if (!masters || masters.length === 0) return null;
    targetChartId = masters[0].id;
  } else {
    targetChartId = chartId;
  }

  const chartIds = [targetChartId, ...(await getAllDescendantChartIds(supabase, targetChartId))];

  let momentum: MomentumScoreResult;
  try {
    momentum = await calculateMomentumScore(targetChartId, supabase, chartIds);
  } catch (err) {
    console.error("[getMomentumData] calculateMomentumScore error:", err);
    return null;
  }

  const lastWeekStart = getMondayOfWeek(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const { data: latestMomentumRow } = await supabase
    .from("momentum_scores")
    .select("ai_insight")
    .eq("chart_id", targetChartId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: prevWeekRow } = await supabase
    .from("momentum_scores")
    .select("score")
    .eq("chart_id", targetChartId)
    .eq("week_start", lastWeekStart)
    .maybeSingle();

  const prevScore = prevWeekRow?.score ?? null;
  const diff = prevScore !== null ? momentum.score - prevScore : null;
  const aiInsight = latestMomentumRow?.ai_insight ?? null;

  const { data: chartRow } = await supabase
    .from("charts")
    .select("title")
    .eq("id", targetChartId)
    .single();

  return {
    chartId: targetChartId,
    chartTitle: chartRow?.title ?? "",
    score: momentum.score,
    scoreDisplay: Math.min(100, Math.max(0, momentum.score)),
    prevScore,
    diff,
    aiInsight,
    details: momentum.details,
  };
}

export type MomentumTrendPoint = {
  week: string;
  score: number;
};

export async function getMomentumTrend(
  workspaceId: string,
  chartId: string | null
): Promise<MomentumTrendPoint[]> {
  const supabase = await createClient();
  let targetChartId: string;
  if (!chartId || chartId === "all") {
    const { data: masters } = await supabase
      .from("charts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .is("parent_action_id", null)
      .order("title")
      .limit(1);
    if (!masters || masters.length === 0) return [];
    targetChartId = masters[0].id;
  } else {
    targetChartId = chartId;
  }

  const { data: rows } = await supabase
    .from("momentum_scores")
    .select("week_start, score")
    .eq("chart_id", targetChartId)
    .order("week_start", { ascending: false })
    .limit(8);

  if (!rows || rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) => new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
  );

  return sorted.map((r) => {
    const d = new Date(r.week_start);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return {
      week: `${month}/${day}`,
      score: Math.min(100, Math.max(0, r.score)),
    };
  });
}

export type ChartTreeNode = {
  id: string;
  title: string;
  depth: number;
  childCount: number;
};

export async function getChartTree(workspaceId: string): Promise<ChartTreeNode[]> {
  const supabase = await createClient();

  const { data: charts } = await supabase
    .from("charts")
    .select("id, title, parent_action_id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("title");

  if (!charts || charts.length === 0) return [];

  const chartIds = charts.map((c) => c.id);

  const { data: actions } = await supabase
    .from("actions")
    .select("chart_id, child_chart_id")
    .in("chart_id", chartIds)
    .not("child_chart_id", "is", null);

  const childrenMap = new Map<string, Set<string>>();
  for (const action of actions || []) {
    if (!action.child_chart_id) continue;
    if (!childrenMap.has(action.chart_id)) childrenMap.set(action.chart_id, new Set());
    childrenMap.get(action.chart_id)!.add(action.child_chart_id);
  }

  const chartMap = new Map(charts.map((c) => [c.id, c]));
  const masters = charts.filter((c) => c.parent_action_id === null);
  const result: ChartTreeNode[] = [];
  const visited = new Set<string>();

  function traverse(chartId: string, depth: number) {
    if (visited.has(chartId)) return;
    visited.add(chartId);
    const chart = chartMap.get(chartId);
    if (!chart) return;

    const childIds = [...(childrenMap.get(chartId) ?? [])]
      .filter((id) => chartMap.has(id))
      .sort((a, b) => (chartMap.get(a)!.title).localeCompare(chartMap.get(b)!.title));

    result.push({ id: chart.id, title: chart.title, depth, childCount: childIds.length });

    for (const childId of childIds) {
      traverse(childId, depth + 1);
    }
  }

  for (const master of masters) {
    traverse(master.id, 0);
  }

  return result;
}

export type DashboardStats = {
  totalCharts: number;
  totalActions: number;
  completedActions: number;
  completionRate: number;
  statusDistribution: {
    todo: number;
    in_progress: number;
    done: number;
    pending: number;
    canceled: number;
  };
};

export type StaleChart = {
  id: string;
  title: string;
  updated_at: string;
  daysSinceUpdate: number;
};

export type UpcomingDeadline = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  chart_id: string;
  chart_title: string;
  isOverdue: boolean;
  daysUntilDue: number;
  blockingCount: number;
};

export type DelayImpact = {
  action: {
    id: string;
    title: string;
    due_date: string;
    status: string;
    daysOverdue: number;
  };
  chart: { id: string; title: string };
  assignee: { id: string; name: string } | null;
  blockedActions: {
    id: string;
    title: string;
    chartId: string;
    chartTitle: string;
    assignee: { id: string; name: string } | null;
  }[];
  affectedPeople: { id: string; name: string }[];
};

export type CascadeNode = {
  action: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    daysOverdue: number | null;
  };
  assignee: { id: string; name: string } | null;
  chart: { id: string; title: string };
  isRoot: boolean;
  children: CascadeNode[];
};

export type ChartHealth = {
  id: string;
  title: string;
  updated_at: string;
  daysSinceUpdate: number;
  status: "critical" | "warning" | "healthy";
};

export type ActionAlert = {
  id: string;
  title: string;
  chartId: string;
  chartTitle: string;
  alertType: "blocker" | "overdue" | "approaching";
  priority: number;
  badgeText: string;
  blockedCount?: number;
  daysOverdue?: number;
  daysUntilDue?: number;
  assignee?: { id: string; name: string } | null;
};

export async function getDashboardData(
  workspaceId: string,
  chartId?: string,
  period?: string | null,
  from?: string | null,
  to?: string | null
): Promise<{
  stats: DashboardStats;
  actionAlerts: ActionAlert[];
  chartHealthList: ChartHealth[];
  delayCascade: CascadeNode[];
  availableCharts: ChartTreeNode[];
}> {
  const supabase = await createClient();
  const now = new Date();
  const periodRange = getPeriodRange(period, from, to);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const chartTree = await getChartTree(workspaceId);

  let targetChartIds: string[] | null = null;
  if (chartId && chartId !== "all") {
    targetChartIds = await getAllDescendantChartIds(supabase, chartId);
    targetChartIds.push(chartId);
  }

  let chartsQuery = supabase
    .from("charts")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);

  if (targetChartIds) {
    chartsQuery = chartsQuery.in("id", targetChartIds);
  }

  const { data: charts, error: chartsError } = await chartsQuery;

  if (chartsError) {
    console.error("[getDashboardData] charts error:", chartsError);
    throw chartsError;
  }

  let actionsQuery = supabase
    .from("actions")
    .select(
      `
      id,
      title,
      status,
      is_completed,
      due_date,
      assignee,
      created_at,
      updated_at,
      tension_id,
      tensions!inner(chart_id, charts!inner(id, title, archived_at, workspace_id))
    `
    )
    .eq("tensions.charts.workspace_id", workspaceId)
    .is("tensions.charts.archived_at", null);

  if (targetChartIds) {
    actionsQuery = actionsQuery.in("tensions.chart_id", targetChartIds);
  }

  const { data: actions, error: actionsError } = await actionsQuery;

  if (actionsError) {
    console.error("[getDashboardData] actions error:", actionsError);
  }

  const allActions = actions || [];
  const allCharts = charts || [];

  let actionsForPeriodStats = allActions;
  if (periodRange) {
    const startTime = periodRange.start.getTime();
    const endTime = periodRange.end.getTime();
    actionsForPeriodStats = allActions.filter((action: any) => {
      const createdAt = action.created_at ? new Date(action.created_at).getTime() : 0;
      return createdAt >= startTime && createdAt <= endTime;
    });
  }

  const statusDistribution = {
    todo: 0,
    in_progress: 0,
    done: 0,
    pending: 0,
    canceled: 0,
  };

  for (const action of actionsForPeriodStats) {
    const status = action.status || (action.is_completed ? "done" : "todo");
    if (status in statusDistribution) {
      statusDistribution[status as keyof typeof statusDistribution]++;
    } else {
      statusDistribution.todo++;
    }
  }

  const totalActions = actionsForPeriodStats.length;

  let completedActions: number;
  if (periodRange) {
    const startTime = periodRange.start.getTime();
    const endTime = periodRange.end.getTime();
    completedActions = allActions.filter((action: any) => {
      const status = action.status || (action.is_completed ? "done" : "todo");
      if (status !== "done") return false;
      const updatedAt = action.updated_at ? new Date(action.updated_at).getTime() : 0;
      return updatedAt >= startTime && updatedAt <= endTime;
    }).length;
  } else {
    completedActions = statusDistribution.done + statusDistribution.canceled;
  }

  const completionRate =
    totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  const chartHealthList: ChartHealth[] = allCharts
    .map((chart) => {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - new Date(chart.updated_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const status: ChartHealth["status"] =
        daysSinceUpdate >= 30
          ? "critical"
          : daysSinceUpdate >= 7
            ? "warning"
            : "healthy";
      return {
        id: chart.id,
        title: chart.title,
        updated_at: chart.updated_at,
        daysSinceUpdate,
        status,
      };
    })
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  const overdueActionIds = allActions
    .filter((a: any) => {
      if (!a.due_date) return false;
      if (a.status === "done" || a.status === "canceled") return false;
      return new Date(a.due_date) < now;
    })
    .map((a: any) => a.id);

  let blockingCountByActionId: Record<string, number> = {};
  if (overdueActionIds.length > 0) {
    const { data: deps } = await supabase
      .from("action_dependencies")
      .select("blocker_action_id")
      .in("blocker_action_id", overdueActionIds);
    blockingCountByActionId = (deps || []).reduce(
      (acc: Record<string, number>, row: any) => {
        const bid = row.blocker_action_id;
        acc[bid] = (acc[bid] || 0) + 1;
        return acc;
      },
      {}
    );
  }

  const upcomingDeadlines: UpcomingDeadline[] = allActions
    .filter((action) => {
      if (!action.due_date) return false;
      if (action.status === "done" || action.status === "canceled") return false;
      const dueDate = new Date(action.due_date);
      return dueDate <= sevenDaysFromNow;
    })
    .map((action: any) => {
      const dueDate = new Date(action.due_date);
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const chartData = action.tensions?.charts;
      return {
        id: action.id,
        title: action.title || "(無題)",
        due_date: action.due_date,
        status: action.status || "todo",
        chart_id: chartData?.id || "",
        chart_title: chartData?.title || "",
        isOverdue: daysUntilDue < 0,
        daysUntilDue,
        blockingCount: blockingCountByActionId[action.id] || 0,
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 10);

  const delayImpacts = await buildDelayImpacts(
    supabase,
    allActions,
    overdueActionIds,
    now
  );

  const delayCascade = await buildDelayCascade(
    supabase,
    allActions,
    overdueActionIds,
    now
  );

  const actionAlerts: ActionAlert[] = [];

  for (const impact of delayImpacts) {
    if (impact.blockedActions.length > 0) {
      actionAlerts.push({
        id: impact.action.id,
        title: impact.action.title,
        chartId: impact.chart.id,
        chartTitle: impact.chart.title,
        alertType: "blocker",
        priority: 1,
        badgeText: `${impact.blockedActions.length}件ブロック中`,
        blockedCount: impact.blockedActions.length,
        daysOverdue: impact.action.daysOverdue,
        assignee: impact.assignee,
      });
    }
  }

  const addedIds = new Set(actionAlerts.map((a) => a.id));

  for (const deadline of upcomingDeadlines) {
    if (addedIds.has(deadline.id)) continue;
    if (deadline.isOverdue) {
      actionAlerts.push({
        id: deadline.id,
        title: deadline.title,
        chartId: deadline.chart_id,
        chartTitle: deadline.chart_title,
        alertType: "overdue",
        priority: 2,
        badgeText: `${Math.abs(deadline.daysUntilDue)}日超過`,
        daysOverdue: Math.abs(deadline.daysUntilDue),
      });
      addedIds.add(deadline.id);
    }
  }

  for (const deadline of upcomingDeadlines) {
    if (addedIds.has(deadline.id)) continue;
    if (!deadline.isOverdue && deadline.daysUntilDue <= 3) {
      actionAlerts.push({
        id: deadline.id,
        title: deadline.title,
        chartId: deadline.chart_id,
        chartTitle: deadline.chart_title,
        alertType: "approaching",
        priority: 3,
        badgeText:
          deadline.daysUntilDue === 0
            ? "今日が期限"
            : `あと${deadline.daysUntilDue}日`,
        daysUntilDue: deadline.daysUntilDue,
      });
      addedIds.add(deadline.id);
    }
  }

  actionAlerts.sort(
    (a, b) =>
      a.priority - b.priority || (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)
  );
  actionAlerts.splice(10);

  const stats: DashboardStats = {
    totalCharts: allCharts.length,
    totalActions,
    completedActions,
    completionRate,
    statusDistribution,
  };

  return {
    stats,
    actionAlerts,
    chartHealthList,
    delayCascade,
    availableCharts: chartTree,
  };
}

async function buildDelayImpacts(
  supabase: any,
  allActions: any[],
  overdueActionIds: string[],
  now: Date
): Promise<DelayImpact[]> {
  if (overdueActionIds.length === 0) return [];

  const actionMap = new Map(allActions.map((a) => [a.id, a]));

  const { data: deps } = await supabase
    .from("action_dependencies")
    .select("id, blocked_action_id, blocker_action_id")
    .in("blocker_action_id", overdueActionIds);

  const blockedByBlocker = new Map<string, string[]>();
  const allBlockedIds = new Set<string>();
  for (const row of deps || []) {
    const blockerId = (row as { blocker_action_id: string }).blocker_action_id;
    const blockedId = (row as { blocked_action_id: string }).blocked_action_id;
    if (!blockedByBlocker.has(blockerId)) blockedByBlocker.set(blockerId, []);
    blockedByBlocker.get(blockerId)!.push(blockedId);
    allBlockedIds.add(blockedId);
  }

  const missingBlockedIds = [...allBlockedIds].filter((id) => !actionMap.has(id));
  if (missingBlockedIds.length > 0) {
    const { data: extraActions } = await supabase
      .from("actions")
      .select(
        `
        id,
        title,
        assignee,
        tension_id,
        tensions(chart_id, charts(id, title))
      `
      )
      .in("id", missingBlockedIds);
    for (const a of extraActions || []) {
      actionMap.set((a as { id: string }).id, a);
    }
  }

  const assigneeEmails = [
    ...new Set(
      Array.from(actionMap.values())
        .filter((a) => a.assignee)
        .map((a) => a.assignee as string)
    ),
  ];
  const profileByEmail: Record<string, { id: string; name: string }> = {};
  if (assigneeEmails.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, name")
      .in("email", assigneeEmails);
    for (const p of profiles || []) {
      const email = (p as { email?: string }).email;
      if (email) {
        profileByEmail[email] = {
          id: (p as { id: string }).id,
          name: ((p as { name?: string }).name || email).trim() || email,
        };
      }
    }
  }

  const impacts: DelayImpact[] = overdueActionIds
    .map((actionId) => {
      const action = actionMap.get(actionId);
      if (!action) return null;
      const dueDate = new Date(action.due_date);
      const daysOverdue = Math.ceil(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const chartData = action.tensions?.charts;
      const blockedIds = blockedByBlocker.get(actionId) || [];
      const blockedActions = blockedIds
        .map((bid) => actionMap.get(bid))
        .filter(Boolean)
        .map((a: any) => {
          const t = Array.isArray(a.tensions) ? a.tensions[0] : a.tensions;
          const c = t?.charts ?? t;
          return {
            id: a.id,
            title: a.title || "(無題)",
            chartId: c?.id ?? "",
            chartTitle: c?.title ?? "",
            assignee: a.assignee ? profileByEmail[a.assignee] || null : null,
          };
        });

      const affectedPeopleMap = new Map<string, { id: string; name: string }>();
      if (action.assignee && profileByEmail[action.assignee]) {
        const p = profileByEmail[action.assignee];
        affectedPeopleMap.set(p.id, p);
      }
      for (const ba of blockedActions) {
        if (ba.assignee) {
          affectedPeopleMap.set(ba.assignee.id, ba.assignee);
        }
      }

      return {
        action: {
          id: action.id,
          title: action.title || "(無題)",
          due_date: action.due_date,
          status: action.status || "todo",
          daysOverdue,
        },
        chart: { id: chartData?.id || "", title: chartData?.title || "" },
        assignee: action.assignee ? profileByEmail[action.assignee] || null : null,
        blockedActions,
        affectedPeople: Array.from(affectedPeopleMap.values()),
      };
    })
    .filter((x): x is DelayImpact => x !== null);

  return impacts
    .sort((a, b) => b.blockedActions.length - a.blockedActions.length)
    .slice(0, 5);
}

function countDescendants(node: CascadeNode): number {
  return node.children.reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0
  );
}

async function buildDelayCascade(
  supabase: any,
  allActions: any[],
  overdueActionIds: string[],
  now: Date
): Promise<CascadeNode[]> {
  if (overdueActionIds.length === 0) return [];

  const actionMap = new Map(allActions.map((a) => [a.id, a]));

  const { data: deps } = await supabase
    .from("action_dependencies")
    .select("blocked_action_id, blocker_action_id")
    .in("blocker_action_id", overdueActionIds);

  let allDeps = deps || [];
  let toFetch = [...overdueActionIds];

  while (toFetch.length > 0) {
    const blockedIds = [
      ...new Set(
        allDeps
          .filter((d: any) => toFetch.includes(d.blocker_action_id))
          .map((d: any) => d.blocked_action_id)
      ),
    ].filter((id) => !actionMap.has(id));
    if (blockedIds.length === 0) break;

    const { data: extraActions } = await supabase
      .from("actions")
      .select(
        `
        id,
        title,
        status,
        due_date,
        assignee,
        tension_id,
        tensions(chart_id, charts(id, title))
      `
      )
      .in("id", blockedIds);
    for (const a of extraActions || []) {
      actionMap.set((a as { id: string }).id, a);
    }

    const { data: moreDeps } = await supabase
      .from("action_dependencies")
      .select("blocked_action_id, blocker_action_id")
      .in("blocker_action_id", blockedIds);
    allDeps = [...allDeps, ...(moreDeps || [])];
    toFetch = blockedIds as string[];
  }
  const assigneeEmails: string[] = [
    ...new Set(
      allActions.filter((a) => a.assignee).map((a) => a.assignee as string)
    ),
  ];
  const profileByEmail: Record<string, { id: string; name: string }> = {};
  if (assigneeEmails.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, name")
      .in("email", assigneeEmails);
    for (const p of profiles || []) {
      const email = (p as { email?: string }).email;
      if (email) {
        profileByEmail[email] = {
          id: (p as { id: string }).id,
          name: ((p as { name?: string }).name || email).trim() || email,
        };
      }
    }
  }

  const roots: CascadeNode[] = [];

  for (const overdueId of overdueActionIds) {
    const action = actionMap.get(overdueId);
    if (!action) continue;

    const root = buildCascadeNode(
      action,
      allDeps,
      actionMap,
      profileByEmail,
      now,
      true,
      new Set<string>()
    );
    if (root.children.length > 0) {
      roots.push(root);
    }
  }

  return roots.sort(
    (a, b) => countDescendants(b) - countDescendants(a)
  );
}

function buildCascadeNode(
  action: any,
  allDeps: any[],
  actionMap: Map<string, any>,
  profileByEmail: Record<string, { id: string; name: string }>,
  now: Date,
  isRoot: boolean,
  visited: Set<string>
): CascadeNode {
  if (visited.has(action.id)) {
    return {
      action: {
        id: action.id,
        title: action.title || "(無題)",
        status: action.status || "todo",
        due_date: action.due_date,
        daysOverdue: null,
      },
      assignee: null,
      chart: { id: "", title: "" },
      isRoot,
      children: [],
    };
  }
  visited.add(action.id);

  const blockedDeps = allDeps.filter(
    (d: any) => d.blocker_action_id === action.id
  );
  const children: CascadeNode[] = [];
  for (const dep of blockedDeps) {
    const blockedAction = actionMap.get(dep.blocked_action_id);
    if (blockedAction) {
      children.push(
        buildCascadeNode(
          blockedAction,
          allDeps,
          actionMap,
          profileByEmail,
          now,
          false,
          visited
        )
      );
    }
  }

  const chartData = action.tensions?.charts;
  const dueDate = action.due_date ? new Date(action.due_date) : null;
  const daysOverdue =
    dueDate && dueDate < now
      ? Math.ceil(
          (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;

  return {
    action: {
      id: action.id,
      title: action.title || "(無題)",
      status: action.status || "todo",
      due_date: action.due_date,
      daysOverdue,
    },
    assignee: action.assignee ? profileByEmail[action.assignee] || null : null,
    chart: {
      id: chartData?.id || "",
      title: chartData?.title || "",
    },
    isRoot,
    children,
  };
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
