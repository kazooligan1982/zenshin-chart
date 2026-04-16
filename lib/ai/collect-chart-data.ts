import type { Chart, VisionItem, RealityItem, Tension, ActionPlan, Area } from "@/types/chart";

export interface ChartDataForAI {
  title: string;
  dueDate: string | null;
  areas: { name: string; color: string }[];
  visions: { content: string; area?: string; dueDate?: string }[];
  realities: { content: string; area?: string; dueDate?: string }[];
  tensions: {
    title: string;
    status: string;
    area?: string;
    actions: {
      title: string;
      status: string;
      assignee?: string;
      dueDate?: string;
      blockers?: string;
    }[];
  }[];
  stats: {
    totalActions: number;
    doneActions: number;
    overdueActions: number;
    unassignedActions: number;
  };
}

export function collectChartDataForAI(
  chart: Chart,
  visions: VisionItem[],
  realities: RealityItem[],
  tensions: Tension[],
  areas: Area[],
  members?: { id: string; display_name?: string }[]
): ChartDataForAI {
  const areaMap = new Map(areas.map((a) => [a.id, a.name]));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _memberMap = new Map(
    (members ?? []).map((m) => [m.id, m.display_name ?? "Unknown"])
  );

  const allActions = tensions.flatMap((t) => t.actionPlans ?? []);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const overdueActions = allActions.filter((a) => {
    if (a.status === "done" || a.status === "canceled") return false;
    if (!a.dueDate) return false;
    return new Date(a.dueDate) < now;
  });

  const unassignedActions = allActions.filter(
    (a) => a.status !== "done" && a.status !== "canceled" && !a.assignee
  );

  return {
    title: chart.title || "",
    dueDate: chart.due_date || null,
    areas: areas.map((a) => ({ name: a.name, color: a.color })),
    visions: visions.map((v) => ({
      content: v.content || "",
      area: v.area_id ? areaMap.get(v.area_id) : undefined,
      dueDate: v.dueDate || undefined,
    })),
    realities: realities.map((r) => ({
      content: r.content || "",
      area: r.area_id ? areaMap.get(r.area_id) : undefined,
      dueDate: r.dueDate || undefined,
    })),
    tensions: tensions.map((t) => ({
      title: t.title || "",
      status: t.status || "active",
      area: t.area_id ? areaMap.get(t.area_id) : undefined,
      actions: (t.actionPlans ?? []).map((a) => ({
        title: a.title || "",
        status: a.status || "todo",
        assignee: a.assignee || undefined,
        dueDate: a.dueDate || undefined,
        blockers: (a as ActionPlan & { blockers?: string }).blockers || undefined,
      })),
    })),
    stats: {
      totalActions: allActions.length,
      doneActions: allActions.filter((a) => a.status === "done").length,
      overdueActions: overdueActions.length,
      unassignedActions: unassignedActions.length,
    },
  };
}
