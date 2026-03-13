"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDroppable, useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Check, ChevronRight, ChevronDown, Trash2, Tag, Loader2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useItemInput } from "@/hooks/use-item-input";
import type { Tension, ActionPlan, TensionStatus, Area } from "@/types/chart";
import {
  handleKeyboardNavigation,
  splitItemsByDate,
  getActionStatusIcon,
} from "../editor-utils";
import { SortableActionItem } from "./SortableActionItem";
import { updateTensionArea } from "../actions";

export function TensionGroup({
  tension,
  tensionIndex,
  areaId,
  allTensions = [],
  handleOptimisticMove,
  handleUpdateTension,
  handleDeleteTension,
  onMoveTensionArea,
  handleUpdateActionPlan,
  handleDeleteActionPlan,
  handleTelescopeClick,
  telescopingActionId,
  currentUser,
  areas,
  chartId,
  onOpenDetailPanel,
  onAddAction,
  isSubmittingAction,
  isOverlay = false,
  onOpenFocus,
  sortByStatus,
  hideCompleted,
  expandedCompletedTensions = new Set(),
  toggleCompletedTensionExpand,
  workspaceMembers = [],
}: {
  tension: Tension;
  tensionIndex: number;
  areaId: string | null;
  allTensions?: Tension[];
  handleOptimisticMove?: (sourceTensionId: string, targetTensionId: string, action: ActionPlan) => void;
  handleUpdateTension: (tensionId: string, field: "title" | "description" | "status", value: string | TensionStatus) => void;
  handleDeleteTension: (tensionId: string) => void;
  onMoveTensionArea?: (tensionId: string, targetAreaId: string | null) => Promise<void>;
  handleUpdateActionPlan: (
    tensionId: string | null,
    actionId: string,
    field: "title" | "dueDate" | "assignee" | "status" | "hasSubChart" | "subChartId" | "childChartId" | "isCompleted" | "description" | "areaId",
    value: string | boolean | null,
    options?: { removeFromTension?: boolean }
  ) => Promise<void>;
  handleDeleteActionPlan: (tensionId: string | null, actionId: string) => Promise<void>;
  handleTelescopeClick: (actionPlan: ActionPlan, tensionId: string | null) => Promise<void>;
  telescopingActionId: string | null;
  currentUser: { id?: string; email: string; name?: string } | null;
  areas: Area[];
  chartId: string;
  onOpenDetailPanel: (itemType: "action", itemId: string, itemContent: string) => void;
  onAddAction: (tensionId: string | null, title: string, areaId?: string | null) => void;
  isSubmittingAction: Record<string, boolean>;
  isOverlay?: boolean;
  onOpenFocus: (tension: Tension) => void;
  sortByStatus?: boolean;
  hideCompleted?: boolean;
  expandedCompletedTensions?: Set<string>;
  toggleCompletedTensionExpand?: (tensionId: string) => void;
  workspaceMembers?: { id: string; email: string; name?: string; avatar_url?: string }[];
}) {
  const t = useTranslations("editor");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const tTags = useTranslations("tags");
  const tk = useTranslations("kanban");
  const [isMovingArea, setIsMovingArea] = useState(false);
  const sortByStatusFlag = sortByStatus ?? false;
  const hideCompletedFlag = hideCompleted ?? false;
  const isResolved = tension.status === "resolved";
  const isExpanded = expandedCompletedTensions?.has(tension.id) ?? false;
  const tensionTitleInput = useItemInput({
    initialValue: tension.title || "",
    onSave: (val) => {
      if (val !== (tension.title || "")) {
        handleUpdateTension(tension.id, "title", val);
      }
    },
    index: tensionIndex,
    sectionId: `tension-${areaId || "uncategorized"}`,
  });
  const newActionInput = useItemInput({
    initialValue: "",
    onSave: () => {},
    sectionId: `new-action-${tension.id}`,
  });
  const { active } = useDndContext();
  const isDragging = !!active;
  const { setNodeRef: setActionListRef, isOver: isActionListOver } = useDroppable({
    id: `action-list-${tension.id}`,
    data: { areaId: areaId ?? null, type: "action-area" },
  });
  const visibleActions = hideCompletedFlag
    ? tension.actionPlans.filter((a) => a.status !== "done" && !a.isCompleted)
    : tension.actionPlans;
  const hiddenCount = hideCompletedFlag
    ? tension.actionPlans.length - visibleActions.length
    : 0;
  const STATUS_ORDER = ["in_progress", "todo", "pending", "unset", "done", "canceled"] as const;
  const getStatusKey = (a: ActionPlan) => {
    if (a.isCompleted || a.status === "done") return "done";
    return a.status || "unset";
  };
  const groupedByStatus = sortByStatusFlag
    ? STATUS_ORDER.reduce<{ key: string; actions: ActionPlan[] }[]>((acc, key) => {
        const group = visibleActions.filter((a) => getStatusKey(a) === key);
        if (group.length > 0) acc.push({ key, actions: group });
        return acc;
      }, [])
    : null;
  const dateSplit = splitItemsByDate(
    visibleActions,
    (action) => action.dueDate || null
  );
  const { datedItems, undatedItems, indexById } = dateSplit;
  const allItemsForIndex = [...dateSplit.datedItems, ...dateSplit.undatedItems];
  const indexByIdAll = new Map(allItemsForIndex.map((item, i) => [item.id, i]));

  const sortableId = `tension-${tension.id}`;
  const sortableAreaId = tension.area_id ?? areaId ?? null;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isDraggingThis,
    isOver,
  } = useSortable({
    id: sortableId,
    data: {
      type: "tension",
      areaId: sortableAreaId,
    },
    disabled: isOverlay,
  });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isOverlay ? 1 : isDraggingThis ? 0.5 : 1,
  };

  const handleNewActionKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const title = newActionInput.value.trim();
      if (title) {
        onAddAction(tension.id, title, areaId);
        newActionInput.setValue("");
      }
      return;
    }
    newActionInput.handleKeyDown(e);
  };

  const handleMoveTensionArea = async (targetAreaId: string | null) => {
    setIsMovingArea(true);
    if (onMoveTensionArea) {
      await onMoveTensionArea(tension.id, targetAreaId);
    } else {
      const result = await updateTensionArea(tension.id, targetAreaId, chartId, true);
      if (result.success) {
        const areaName =
          targetAreaId !== null ? areas.find((area) => area.id === targetAreaId)?.name : tTags("untagged");
        toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
      } else {
        toast.error(tt("moveFailed"), { duration: 5000 });
      }
    }
    setIsMovingArea(false);
  };

  if (isResolved && !isExpanded) {
    return (
      <div
        ref={setNodeRef}
        style={isOverlay ? undefined : sortableStyle}
        className={cn(
          "group/tension border rounded-md bg-white transition-colors transition-transform",
          !isOverlay && "w-full min-w-0 flex-shrink-0",
          isOverlay && "shadow-2xl border-blue-500 ring-2 ring-blue-200",
          !isOverlay && (isOver ? "border-2 border-blue-400 ring-2 ring-blue-200" : "border border-gray-200")
        )}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 opacity-60 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => toggleCompletedTensionExpand?.(tension.id)}
        >
          {!isOverlay && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-zenshin-navy/8 rounded shrink-0"
              title={t("dragToReorder")}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4 text-zenshin-navy/40" />
            </div>
          )}
          <button
            type="button"
            className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-emerald-500 text-white flex items-center justify-center"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleUpdateTension(tension.id, "status", "active");
            }}
            title={t("markIncomplete")}
          >
            <Check className="w-3 h-3" />
          </button>
          <span className="text-sm font-bold text-zenshin-navy/50 line-through flex-1 line-clamp-2 break-words">
            {tension.title}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? undefined : sortableStyle}
      className={cn(
        "group/tension border rounded-md bg-white transition-colors transition-transform",
        !isOverlay && "w-full min-w-0 flex-shrink-0",
        isOverlay && "shadow-2xl border-blue-500 ring-2 ring-blue-200",
        !isOverlay && (isOver ? "border-2 border-blue-400 ring-2 ring-blue-200" : "border border-gray-200"),
        isResolved && isExpanded && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-4 px-3 py-2 border-b mb-1 bg-gray-50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {!isOverlay && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-zenshin-navy/8 rounded shrink-0"
              title={t("dragToReorder")}
            >
              <GripVertical className="h-4 w-4 text-zenshin-navy/40" />
            </div>
          )}
          <button
            type="button"
            className={cn(
              "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
              tension.status === "resolved"
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-gray-300 hover:border-emerald-400 text-transparent hover:text-emerald-400"
            )}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleUpdateTension(
                tension.id,
                "status",
                tension.status === "resolved" ? "active" : "resolved"
              );
            }}
            title={tension.status === "resolved" ? t("markIncomplete") : t("markComplete")}
          >
            <Check className="w-3 h-3" />
          </button>
          <Input
            {...tensionTitleInput.bind}
            placeholder={t("tensionGapPlaceholder")}
            className="text-base font-semibold bg-transparent border-none focus-visible:ring-0 flex-1 min-w-0 keyboard-focusable"
            onKeyDown={(e) => {
              tensionTitleInput.handleKeyDown(e);
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                handleKeyboardNavigation(e);
              }
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          {isResolved && isExpanded && (
            <button
              className="p-1 rounded transition-all hover:bg-gray-200"
              onClick={() => toggleCompletedTensionExpand?.(tension.id)}
              title={t("collapse")}
            >
              <ChevronDown className="h-4 w-4 text-zenshin-navy/50" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded transition-all hover:bg-gray-200 opacity-0 group-hover/tension:opacity-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isMovingArea}
                title={t("changeCategory")}
              >
                <Tag className="h-4 w-4 text-zenshin-navy/50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleMoveTensionArea(null)}
                disabled={!tension.area_id}
              >
                {t("moveToUntagged")}
              </DropdownMenuItem>
              {areas.map((area) => (
                <DropdownMenuItem
                  key={area.id}
                  onClick={() => handleMoveTensionArea(area.id)}
                  disabled={tension.area_id === area.id}
                >
                  <span
                    className="mr-2 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  {area.name}
                  {tension.area_id === area.id ? " ✓" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zenshin-navy/40 hover:text-gray-600 hover:bg-zenshin-navy/8 rounded-full p-1 opacity-0 group-hover/tension:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteTension(tension.id);
            }}
            title={tc("delete")}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {!isOverlay && (
        <div className="px-3 pt-1 pb-2">
        {sortByStatusFlag && groupedByStatus ? (
          <div className="space-y-0">
            {groupedByStatus.map(({ key, actions: groupActions }, idx) => (
              <div key={key}>
                <div
                  className={
                    idx === 0
                      ? "flex items-center gap-1.5 px-2 pt-1 pb-1"
                      : "flex items-center gap-1.5 px-2 pt-3 pb-1 border-t border-gray-100"
                  }
                >
                  {getActionStatusIcon(
                    key === "unset" ? null : (key as ActionPlan["status"]),
                    key === "done"
                  )}
                  <span className="text-xs font-medium text-gray-500">
                    {(key === "done"
                      ? tk("done")
                      : key === "in_progress"
                        ? tk("inProgress")
                        : key === "pending"
                          ? tk("pending")
                          : key === "canceled"
                            ? tk("canceled")
                            : tk("todo"))}{" "}
                    ({groupActions.length})
                  </span>
                </div>
                <SortableContext
                  items={groupActions.map((a) => a.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {groupActions.map((action) => (
                    <SortableActionItem
                      key={action.id}
                      actionPlan={action}
                      actionIndex={indexByIdAll.get(action.id) ?? 0}
                      tensionId={tension.id}
                      parentTensionAreaId={tension.area_id ?? null}
                      hideAreaBadge
                      isCompleted={action.isCompleted || false}
                      handleUpdateActionPlan={handleUpdateActionPlan}
                      handleDeleteActionPlan={handleDeleteActionPlan}
                      handleTelescopeClick={handleTelescopeClick}
                      telescopingActionId={telescopingActionId}
                      currentUser={currentUser}
                      areas={areas}
                      chartId={chartId}
                      onOpenDetailPanel={onOpenDetailPanel}
                      disabled={key === "done"}
                      allTensions={allTensions}
                      handleOptimisticMove={handleOptimisticMove}
                      workspaceMembers={workspaceMembers}
                    />
                  ))}
                </SortableContext>
              </div>
            ))}
          </div>
        ) : (
          <>
            {datedItems.length > 0 && (
              <SortableContext
                items={datedItems.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                {datedItems.map((action) => (
                  <SortableActionItem
                    key={action.id}
                    actionPlan={action}
                    actionIndex={indexById.get(action.id) ?? 0}
                    tensionId={tension.id}
                    parentTensionAreaId={tension.area_id ?? null}
                    hideAreaBadge
                    isCompleted={action.isCompleted || false}
                    handleUpdateActionPlan={handleUpdateActionPlan}
                    handleDeleteActionPlan={handleDeleteActionPlan}
                    handleTelescopeClick={handleTelescopeClick}
                    telescopingActionId={telescopingActionId}
                    currentUser={currentUser}
                    areas={areas}
                    chartId={chartId}
                    onOpenDetailPanel={onOpenDetailPanel}
                    disabled
                    allTensions={allTensions}
                    handleOptimisticMove={handleOptimisticMove}
                    workspaceMembers={workspaceMembers}
                  />
                ))}
              </SortableContext>
            )}
            {datedItems.length > 0 && undatedItems.length > 0 && (
              <div className="h-px bg-zenshin-navy/8 my-3" />
            )}
            <div ref={setActionListRef} className="min-h-[40px]">
              <SortableContext
                items={undatedItems.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div id={`action-list-container-${tension.id}`} className="space-y-1">
                  {undatedItems.length === 0 ? (
                    isDragging ? (
                      <div
                        className={`border-2 border-dashed rounded p-6 text-center transition-colors ${
                          isActionListOver
                            ? "border-blue-400 bg-blue-50 text-blue-600"
                            : "border-gray-300 text-zenshin-navy/40"
                        }`}
                      >
                        <div className="text-sm font-medium">{t("dropHere")}</div>
                      </div>
                    ) : null
                  ) : (
                    undatedItems.map((action) => (
                      <SortableActionItem
                        key={action.id}
                        actionPlan={action}
                        actionIndex={indexById.get(action.id) ?? 0}
                        tensionId={tension.id}
                        parentTensionAreaId={tension.area_id ?? null}
                        hideAreaBadge
                        isCompleted={action.isCompleted || false}
                        handleUpdateActionPlan={handleUpdateActionPlan}
                        handleDeleteActionPlan={handleDeleteActionPlan}
                        handleTelescopeClick={handleTelescopeClick}
                        telescopingActionId={telescopingActionId}
                        currentUser={currentUser}
                        areas={areas}
                        chartId={chartId}
                        onOpenDetailPanel={onOpenDetailPanel}
                        allTensions={allTensions}
                        handleOptimisticMove={handleOptimisticMove}
                        workspaceMembers={workspaceMembers}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </div>
          </>
        )}
        {hideCompletedFlag && hiddenCount > 0 && (
          <div className="text-center py-1.5 text-xs text-gray-300">
            {t("hiddenCompletedCount", { count: hiddenCount })}
          </div>
        )}
        <div className="mt-2 py-1.5 px-2 border-t border-zenshin-navy/5 bg-white">
          <div className="flex gap-2">
            <Input
              {...newActionInput.bind}
              onKeyDown={(e) => {
                handleNewActionKeyDown(e);
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  handleKeyboardNavigation(e);
                }
              }}
              placeholder={t("addActionToTension")}
              className="text-sm h-7 flex-1"
              disabled={isSubmittingAction[tension.id]}
            />
            <Button
              onClick={() => {
                const title = newActionInput.value.trim();
                if (title) {
                  onAddAction(tension.id, title, areaId);
                  newActionInput.setValue("");
                }
              }}
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={!newActionInput.value.trim() || isSubmittingAction[tension.id]}
            >
              {isSubmittingAction[tension.id] ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
