import type { ChartDataForAI } from "./collect-chart-data";

interface SnapshotDataRaw {
  chart?: { title?: string; due_date?: string };
  areas?: { id?: string; name?: string; color?: string }[];
  visions?: { content?: string; title?: string; area_id?: string; due_date?: string }[];
  realities?: { content?: string; title?: string; area_id?: string; due_date?: string }[];
  tensions?: { id?: string; title?: string; content?: string; status?: string; area_id?: string }[];
  actions?: { title?: string; content?: string; status?: string; assignee_name?: string; assignee_id?: string; due_date?: string; blockers?: string; tension_id?: string }[];
}

export function snapshotDataToChartDataForAI(
  snapshotData: SnapshotDataRaw | null | undefined,
  chartTitle: string
): ChartDataForAI {
  if (!snapshotData) {
    return {
      title: chartTitle,
      dueDate: null,
      areas: [],
      visions: [],
      realities: [],
      tensions: [],
      stats: { totalActions: 0, doneActions: 0, overdueActions: 0, unassignedActions: 0 },
    };
  }

  const areas = (snapshotData.areas || []).map((a) => ({
    name: a.name || "",
    color: a.color || "",
  }));

  const areaMap = new Map<string, string>();
  (snapshotData.areas || []).forEach((a) => {
    if (a.id && a.name) areaMap.set(a.id, a.name);
  });

  const visions = (snapshotData.visions || []).map((v) => ({
    content: v.content || v.title || "",
    area: v.area_id ? areaMap.get(v.area_id) : undefined,
    dueDate: v.due_date || undefined,
  }));

  const realities = (snapshotData.realities || []).map((r) => ({
    content: r.content || r.title || "",
    area: r.area_id ? areaMap.get(r.area_id) : undefined,
    dueDate: r.due_date || undefined,
  }));

  // Build action map: tension_id -> actions
  type SnapshotAction = NonNullable<SnapshotDataRaw["actions"]>[number];
  const actionsByTension = new Map<string, SnapshotAction[]>();
  const looseActions: SnapshotAction[] = [];
  (snapshotData.actions || []).forEach((a) => {
    if (a.tension_id) {
      if (!actionsByTension.has(a.tension_id)) {
        actionsByTension.set(a.tension_id, []);
      }
      actionsByTension.get(a.tension_id)!.push(a);
    } else {
      looseActions.push(a);
    }
  });

  const tensions = (snapshotData.tensions || []).map((t) => ({
    title: t.title || t.content || "",
    status: t.status || "open",
    area: t.area_id ? areaMap.get(t.area_id) : undefined,
    actions: (actionsByTension.get(t.id!) || []).map((a) => ({
      title: a.title || a.content || "",
      status: a.status || "not_started",
      assignee: a.assignee_name || undefined,
      dueDate: a.due_date || undefined,
      blockers: a.blockers || undefined,
    })),
  }));

  // Add loose actions as a virtual tension if any
  if (looseActions.length > 0) {
    tensions.push({
      title: "(Unlinked Actions)",
      status: "open",
      area: undefined,
      actions: looseActions.map((a) => ({
        title: a.title || a.content || "",
        status: a.status || "not_started",
        assignee: a.assignee_name || undefined,
        dueDate: a.due_date || undefined,
        blockers: a.blockers || undefined,
      })),
    });
  }

  const allActions = snapshotData.actions || [];
  const totalActions = allActions.length;
  const doneActions = allActions.filter((a) => a.status === "done").length;
  const overdueActions = allActions.filter((a) => {
    if (!a.due_date || a.status === "done") return false;
    return new Date(a.due_date) < new Date();
  }).length;
  const unassignedActions = allActions.filter((a) => !a.assignee_id).length;

  return {
    title: snapshotData.chart?.title || chartTitle,
    dueDate: snapshotData.chart?.due_date || null,
    areas,
    visions,
    realities,
    tensions,
    stats: { totalActions, doneActions, overdueActions, unassignedActions },
  };
}
