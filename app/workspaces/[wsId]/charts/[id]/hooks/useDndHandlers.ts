import type { VisionItem, RealityItem, Tension, ActionPlan, Area } from "@/types/chart";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  updateListOrder,
  updateVisionArea,
  updateRealityArea,
  updateActionArea,
  updateTensionArea,
  updateAreaOrder,
} from "../actions";
import { logger } from "@/lib/logger";

export function useDndHandlers({
  chartId,
  chart,
  setChart,
  visions,
  setVisions,
  realities,
  setRealities,
  tensions,
  setTensions,
  looseActions,
  setLooseActions,
  actionMetaById,
  resolveTensionAreaId,
  getVisionDate,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router: _router,
}: {
  chartId: string;
  chart: { areas: Area[] };
  setChart: React.Dispatch<React.SetStateAction<{ areas: Area[] }>>;
  visions: VisionItem[];
  setVisions: React.Dispatch<React.SetStateAction<VisionItem[]>>;
  realities: RealityItem[];
  setRealities: React.Dispatch<React.SetStateAction<RealityItem[]>>;
  tensions: Tension[];
  setTensions: React.Dispatch<React.SetStateAction<Tension[]>>;
  looseActions: ActionPlan[];
  setLooseActions: React.Dispatch<React.SetStateAction<ActionPlan[]>>;
  actionMetaById: Map<string, { tensionId: string | null; areaId: string | null }>;
  resolveTensionAreaId: (tension: Tension) => string | null;
  getVisionDate: (vision: VisionItem) => string | null;
  router: ReturnType<typeof useRouter>;
}) {
  const tt = useTranslations("toast");
  const tTags = useTranslations("tags");
  // ドラッグ＆ドロップハンドラ
  const handleDragEnd = async (event: DragEndEvent, type: "visions" | "realities" | "actions", tensionId?: string) => {
    const { active, over } = event;
    if (active.id === over?.id) return;

    if (type === "visions") {
      // ========== デバッグログ開始 ==========
      const activeVision = visions.find((v) => v.id === active.id);
      // ========== デバッグログ終了 ==========
      if (!over) {
        return;
      }

      const draggedItem = activeVision;
      if (!draggedItem) return;

      if (getVisionDate(draggedItem)) return;

      const overData = over.data?.current as { areaId?: string | null; type?: string } | undefined;
      const targetAreaId = overData?.areaId;
      const targetType = overData?.type;
      const currentAreaId = draggedItem.area_id ?? null;
      const isAreaMove =
        targetAreaId !== undefined &&
        targetAreaId !== currentAreaId &&
        (targetType === "vision-area" || targetType === "vision-item");

      if (isAreaMove) {
          const previousState = visions;
          const targetAreaItems = visions.filter(
          (v) => !getVisionDate(v) && v.area_id === targetAreaId
          );
          const newSortOrder =
            Math.max(...targetAreaItems.map((v) => v.sort_order ?? 0), 0) + 1;

          setVisions((prev) =>
            prev.map((v) =>
              v.id === draggedItem.id
              ? { ...v, area_id: targetAreaId ?? null, sort_order: newSortOrder }
                : v
            )
          );

        try {
          const result = await updateVisionArea(draggedItem.id, targetAreaId ?? null, chartId);
          if (result.success) {
            const areaName =
              targetAreaId !== null
                ? chart.areas.find((a) => a.id === targetAreaId)?.name
                : tTags("untagged");
            toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
          } else {
            throw new Error("Update failed");
          }
        } catch (error) {
          logger.error("❌ Server update failed:", error);
          setVisions(previousState);
          toast.error(tt("moveFailed"), { duration: 5000 });
        }
        return;
      }

      const undatedVisions = visions.filter((v) => !getVisionDate(v));

      const oldIndex = undatedVisions.findIndex((v) => v.id === active.id);
      const newIndex = undatedVisions.findIndex((v) => v.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const previousState = visions;
      const reordered = arrayMove(undatedVisions, oldIndex, newIndex).map(
        (vision, index) => ({
          ...vision,
          sort_order: index,
        })
      );

      const datedVisions = visions
        .filter((v) => !!getVisionDate(v))
        .sort(
          (a, b) =>
            new Date(getVisionDate(a)!).getTime() -
            new Date(getVisionDate(b)!).getTime()
        );

      setVisions([...datedVisions, ...reordered]);
      const items = reordered.map((v, index) => ({ id: v.id, sort_order: index }));
      try {
        await updateListOrder(items, "visions", chartId);
      } catch (error) {
        logger.error("Sort order update failed:", error);
        setVisions(previousState);
        toast.error(tt("orderUpdateFailed"), { duration: 5000 });
      }
    } else if (type === "realities") {
      if (!over) return;
      const draggedItem = realities.find((r) => r.id === active.id);
      if (!draggedItem) return;

      const overData = over.data?.current as { areaId?: string | null; type?: string } | undefined;
      const targetAreaId = overData?.areaId;
      const targetType = overData?.type;
      const currentAreaId = draggedItem.area_id ?? null;
      const isAreaMove =
        targetAreaId !== undefined &&
        targetAreaId !== currentAreaId &&
        (targetType === "reality-area" || targetType === "reality-item");

      if (isAreaMove) {
        const previousState = realities;
        const targetAreaItems = realities.filter(
          (r) => (r.area_id ?? null) === (targetAreaId ?? null)
        );
        const newSortOrder =
          Math.max(...targetAreaItems.map((r) => r.sort_order ?? 0), 0) + 1;

        setRealities((prev) =>
          prev.map((r) =>
            r.id === draggedItem.id
              ? { ...r, area_id: targetAreaId ?? null, sort_order: newSortOrder }
              : r
          )
        );

        const result = await updateRealityArea(draggedItem.id, targetAreaId ?? null, chartId);
        if (result.success) {
          const areaName =
            targetAreaId !== null
              ? chart.areas.find((a) => a.id === targetAreaId)?.name
              : tTags("untagged");
          toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
        } else {
          setRealities(previousState);
          toast.error(tt("moveFailed"), { duration: 5000 });
        }
        return;
      }

      const undatedRealities = realities;
      const oldIndex = undatedRealities.findIndex((r) => r.id === active.id);
      const newIndex = undatedRealities.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const previousState = realities;
      const reordered = arrayMove(undatedRealities, oldIndex, newIndex).map(
        (reality, index) => ({
          ...reality,
          sort_order: index,
        })
      );
      setRealities(reordered);

      const items = reordered.map((r, index) => ({ id: r.id, sort_order: index }));
      try {
        await updateListOrder(items, "realities", chartId);
      } catch (error) {
        logger.error("Sort order update failed:", error);
        setRealities(previousState);
        toast.error(tt("orderUpdateFailed"), { duration: 5000 });
      }
    } else if (type === "actions" && tensionId) {
      if (!over) return;
      const tension = tensions.find((t) => t.id === tensionId);
      if (!tension) return;

      const undatedActions = tension.actionPlans.filter((a) => !a.dueDate);
      const oldIndex = undatedActions.findIndex((a) => a.id === active.id);
      const newIndex = undatedActions.findIndex((a) => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const previousState = tensions;
      const reordered = arrayMove(undatedActions, oldIndex, newIndex).map(
        (action, index) => ({
          ...action,
          sort_order: index,
        })
      );
      const datedActions = tension.actionPlans
        .filter((a) => !!a.dueDate)
        .sort(
          (a, b) =>
            new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
        );

      const updatedTensions = tensions.map((t) =>
        t.id === tensionId
          ? { ...t, actionPlans: [...datedActions, ...reordered] }
          : t
      );
      setTensions(updatedTensions);

      const items = reordered.map((a, index) => ({ id: a.id, sort_order: index }));
      try {
        await updateListOrder(items, "actions", chartId, tensionId);
      } catch (error) {
        logger.error("Sort order update failed:", error);
        setTensions(previousState);
        toast.error(tt("orderUpdateFailed"), { duration: 5000 });
      }
    }
  };

  const handleActionSectionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeData = active.data?.current as { type?: string; areaId?: string | null } | undefined;
    const overData = over.data?.current as { type?: string; areaId?: string | null } | undefined;
    if (activeData?.type === "tension") {
      const activeTensionId = activeId.replace(/^tension-/, "");
      const overTensionId = overId.replace(/^tension-/, "");
      const activeTension = tensions.find((tension) => tension.id === activeTensionId);
      if (!activeTension) return;

      const currentAreaId = resolveTensionAreaId(activeTension);
      const targetAreaId = overData?.areaId;
      const targetType = overData?.type;

      const isAreaMove =
        targetAreaId !== undefined &&
        targetAreaId !== currentAreaId &&
        (targetType === "tension-area" || targetType === "tension" || targetType === "action-area");

      if (isAreaMove) {
        const previousState = tensions;
        const targetAreaTensions = tensions.filter(
          (tension) => (resolveTensionAreaId(tension) || null) === (targetAreaId ?? null)
        );
        const newSortOrder =
          Math.max(...targetAreaTensions.map((tension) => tension.sort_order ?? 0), 0) + 1;

        setTensions((prev) =>
          prev.map((tension) =>
            tension.id === activeTensionId
              ? { ...tension, area_id: targetAreaId ?? null, sort_order: newSortOrder }
              : tension
          )
        );

        const result = await updateTensionArea(
          activeTensionId,
          targetAreaId ?? null,
          chartId,
          true
        );
        if (result.success) {
          const areaName =
            targetAreaId !== null ? chart.areas.find((a) => a.id === targetAreaId)?.name : tTags("untagged");
          toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
        } else {
          setTensions(previousState);
          toast.error(tt("moveFailed"), { duration: 5000 });
        }
        return;
      }

      const overTension = tensions.find((tension) => tension.id === overTensionId);
      const overAreaId = overTension ? resolveTensionAreaId(overTension) : null;
      const isSameAreaSort =
        activeTensionId !== overTensionId &&
        !!overTension &&
        (overAreaId ?? null) === (currentAreaId ?? null);
      if (!isSameAreaSort) return;

      const sameAreaTensions = tensions
        .filter((tension) => (resolveTensionAreaId(tension) || null) === (currentAreaId ?? null))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const oldIndex = sameAreaTensions.findIndex((tension) => tension.id === activeTensionId);
      const newIndex = sameAreaTensions.findIndex((tension) => tension.id === overTensionId);
      if (oldIndex === -1 || newIndex === -1) return;

      const previousState = tensions;
      const reordered = arrayMove(sameAreaTensions, oldIndex, newIndex).map((tension, index) => ({
        ...tension,
        sort_order: index + 1,
      }));
      const sortMap = new Map(reordered.map((tension) => [tension.id, tension.sort_order]));

      setTensions((prev) =>
        prev.map((tension) =>
          sortMap.has(tension.id)
            ? { ...tension, sort_order: sortMap.get(tension.id) }
            : tension
        )
      );

      const items = reordered.map((tension, index) => ({ id: tension.id, sort_order: index + 1 }));
      try {
        await updateListOrder(items, "tensions", chartId);
      } catch (error) {
        logger.error("Sort order update failed:", error);
        setTensions(previousState);
        toast.error(tt("orderUpdateFailed"), { duration: 5000 });
      }
      return;
    }

    const activeMeta = actionMetaById.get(activeId);
    if (!activeMeta) return;

    const allActions = [
      ...looseActions,
      ...tensions.flatMap((tension) => tension.actionPlans),
    ];
    const activeAction = allActions.find((action) => action.id === activeId);
    if (!activeAction || activeAction.dueDate) return;
    const overAction = allActions.find((action) => action.id === overId);
    if (overAction?.dueDate) return;

    const overAreaId = overData?.areaId;
    let targetAreaId = overAreaId ?? null;
    let targetTensionId = activeMeta.tensionId;

    if (overAreaId === undefined) {
      const overMeta = actionMetaById.get(overId);
      targetAreaId = overMeta?.areaId ?? null;
      if (overMeta) {
        targetTensionId = overMeta.tensionId;
      }
    }

    const currentAreaId = activeMeta.areaId ?? null;
    if (targetAreaId !== currentAreaId) {
      const previousTensions = tensions;
      const previousLooseActions = looseActions;
      const targetAreaActions = allActions.filter(
        (action) => !action.dueDate && (action.area_id ?? null) === (targetAreaId ?? null)
      );
      const newSortOrder =
        Math.max(...targetAreaActions.map((action) => action.sort_order ?? 0), 0) + 1;

      if (activeMeta.tensionId) {
        setTensions((prev) =>
          prev.map((tension) =>
            tension.id === activeMeta.tensionId
              ? {
                  ...tension,
                  actionPlans: tension.actionPlans.map((action) =>
                    action.id === activeId
                      ? { ...action, area_id: targetAreaId, sort_order: newSortOrder }
                      : action
                  ),
                }
              : tension
          )
        );
      } else {
        setLooseActions((prev) =>
          prev.map((action) =>
            action.id === activeId
              ? { ...action, area_id: targetAreaId, sort_order: newSortOrder }
              : action
          )
        );
      }
      const result = await updateActionArea(activeId, targetAreaId ?? null, chartId, false);
      if (result.success) {
        const areaName =
          targetAreaId !== null ? chart.areas.find((a) => a.id === targetAreaId)?.name : tTags("untagged");
        toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
      } else {
        setTensions(previousTensions);
        setLooseActions(previousLooseActions);
        toast.error(tt("moveFailed"), { duration: 5000 });
      }
      return;
    }

    if (targetTensionId === activeMeta.tensionId && actionMetaById.has(overId)) {
      if (activeMeta.tensionId) {
        await handleDragEnd(event, "actions", activeMeta.tensionId);
      } else {
        const undatedActions = looseActions.filter((a) => !a.dueDate);
        const oldIndex = undatedActions.findIndex((a) => a.id === activeId);
        const newIndex = undatedActions.findIndex((a) => a.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;

        const previousState = looseActions;
        const reordered = arrayMove(undatedActions, oldIndex, newIndex).map(
          (action, index) => ({
            ...action,
            sort_order: index,
          })
        );
        const datedActions = looseActions
          .filter((a) => !!a.dueDate)
          .sort(
            (a, b) =>
              new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
          );
        setLooseActions([...datedActions, ...reordered]);
        const items = reordered.map((a, index) => ({ id: a.id, sort_order: index }));
        try {
          await updateListOrder(items, "actions", chartId);
        } catch (error) {
          logger.error("Sort order update failed:", error);
          setLooseActions(previousState);
          toast.error(tt("orderUpdateFailed"), { duration: 5000 });
        }
      }
    }
  };

  const handleTensionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    await handleActionSectionDragEnd(event);
  };

  const handleAreaDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);
    if (!activeStr.startsWith("area-") || !overStr.startsWith("area-")) return;

    const activeAreaId = activeStr.replace(/^area-/, "");
    const overAreaId = overStr.replace(/^area-/, "");
    const areas = [...(chart.areas ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const oldIndex = areas.findIndex((a) => a.id === activeAreaId);
    const newIndex = areas.findIndex((a) => a.id === overAreaId);
    if (oldIndex === -1 || newIndex === -1) return;

    const previousAreas = [...areas];
    const reordered = arrayMove(areas, oldIndex, newIndex);
    const areaOrders = reordered.map((area, index) => ({
      areaId: area.id,
      sort_order: index,
    }));

    setChart((prev) => ({
      ...prev,
      areas: reordered.map((a, i) => ({ ...a, sort_order: i })),
    }));

    try {
      const ok = await updateAreaOrder(chartId, areaOrders);
      if (!ok) {
        setChart((prev) => ({ ...prev, areas: previousAreas }));
        toast.error(tt("orderUpdateFailed"), { duration: 5000 });
      }
    } catch (error) {
      logger.error("Area order update failed:", error);
      setChart((prev) => ({ ...prev, areas: previousAreas }));
      toast.error(tt("orderUpdateFailed"), { duration: 5000 });
    }
  };

  return {
    handleDragEnd,
    handleTensionDragEnd,
    handleActionSectionDragEnd,
    handleAreaDragEnd,
  };
}
