import type { ChartDataForAI } from "./collect-chart-data";

export function snapshotDataToChartDataForAI(
  snapshotData: any,
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

  const areas = (snapshotData.areas || []).map((a: any) => ({
    name: a.name || "",
    color: a.color || "",
  }));

  const areaMap = new Map<string, string>();
  (snapshotData.areas || []).forEach((a: any) => {
    if (a.id && a.name) areaMap.set(a.id, a.name);
  });

  const visions = (snapshotData.visions || []).map((v: any) => ({
    content: v.content || v.title || "",
    area: v.area_id ? areaMap.get(v.area_id) : undefined,
    dueDate: v.due_date || undefined,
  }));

  const realities = (snapshotData.realities || []).map((r: any) => ({
    content: r.content || r.title || "",
    area: r.area_id ? areaMap.get(r.area_id) : undefined,
    dueDate: r.due_date || undefined,
  }));

  // Build action map: tension_id -> actions
  const actionsByTension = new Map<string, any[]>();
  const looseActions: any[] = [];
  (snapshotData.actions || []).forEach((a: any) => {
    if (a.tension_id) {
      if (!actionsByTension.has(a.tension_id)) {
        actionsByTension.set(a.tension_id, []);
      }
      actionsByTension.get(a.tension_id)!.push(a);
    } else {
      looseActions.push(a);
    }
  });

  const tensions = (snapshotData.tensions || []).map((t: any) => ({
    title: t.title || t.content || "",
    status: t.status || "open",
    area: t.area_id ? areaMap.get(t.area_id) : undefined,
    actions: (actionsByTension.get(t.id) || []).map((a: any) => ({
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
      actions: looseActions.map((a: any) => ({
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
  const doneActions = allActions.filter((a: any) => a.status === "done").length;
  const overdueActions = allActions.filter((a: any) => {
    if (!a.due_date || a.status === "done") return false;
    return new Date(a.due_date) < new Date();
  }).length;
  const unassignedActions = allActions.filter((a: any) => !a.assignee_id).length;

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
