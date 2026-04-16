"use client";

import { useState } from "react";
import { DragOverlay, useDndMonitor } from "@dnd-kit/core";
import { TensionGroup } from "./TensionGroup";
import type { Tension, ActionPlan, Area } from "@/types/chart";

type TensionDragOverlayProps = {
  tensions: Tension[];
  areas: Area[];
  chartId: string;
  handleUpdateTension: (tensionId: string, field: "title" | "description" | "status", value: string) => void;
  handleDeleteTension: (tensionId: string) => void;
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
  onOpenDetailPanel: (itemType: "action", itemId: string, itemContent: string) => void;
  onAddAction: (tensionId: string | null, title: string, areaId?: string | null) => void;
  isSubmittingAction: Record<string, boolean>;
  handleOptimisticMove?: (sourceTensionId: string, targetTensionId: string, action: ActionPlan) => void;
  workspaceMembers?: { id: string; email: string; name?: string; avatar_url?: string }[];
};

export function TensionDragOverlay(props: TensionDragOverlayProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | null>(null);

  useDndMonitor({
    onDragStart: (event) => {
      const id = String(event.active.id);
      if (id.startsWith("tension-")) {
        setActiveId(id);
        const rect = event.active.rect.current.initial;
        if (rect) {
          setOverlayWidth(rect.width);
        }
      }
    },
    onDragEnd: () => {
      setActiveId(null);
      setOverlayWidth(null);
    },
    onDragCancel: () => {
      setActiveId(null);
      setOverlayWidth(null);
    },
  });

  const tensionId = activeId?.replace(/^tension-/, "");
  const tension = tensionId ? props.tensions.find((t) => t.id === tensionId) : null;

  return (
    <DragOverlay dropAnimation={null}>
      {activeId && tension ? (
        <div
          className="flex-shrink-0"
          style={{ width: overlayWidth ?? undefined, minWidth: 280 }}
        >
          <TensionGroup
            tension={tension}
            tensionIndex={0}
            areaId={tension.area_id ?? null}
            allTensions={props.tensions}
            handleUpdateTension={props.handleUpdateTension}
            handleDeleteTension={props.handleDeleteTension}
            handleUpdateActionPlan={props.handleUpdateActionPlan}
            handleDeleteActionPlan={props.handleDeleteActionPlan}
            handleTelescopeClick={props.handleTelescopeClick}
            telescopingActionId={props.telescopingActionId}
            currentUser={props.currentUser}
            areas={props.areas}
            chartId={props.chartId}
            onOpenDetailPanel={props.onOpenDetailPanel}
            onAddAction={props.onAddAction}
            isSubmittingAction={props.isSubmittingAction}
            isOverlay
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onOpenFocus={(_t) => {}}
            handleOptimisticMove={props.handleOptimisticMove}
            workspaceMembers={props.workspaceMembers}
          />
        </div>
      ) : null}
    </DragOverlay>
  );
}
