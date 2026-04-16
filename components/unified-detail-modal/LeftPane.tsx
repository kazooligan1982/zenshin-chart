"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { TitleEditor } from "./TitleEditor";
import { PropertiesPanel } from "./PropertiesPanel";
import { DetailsEditor } from "./DetailsEditor";
import { ChildChartLink } from "./ChildChartLink";
import { ActionDependencies } from "./ActionDependencies";
import { LinkedResources } from "./LinkedResources";
import { ItemRelations } from "./ItemRelations";
import { ChangeHistorySummary } from "./ChangeHistorySummary";
import type { ItemType } from "./ModalHeader";
import type { VisionItem, RealityItem, ActionPlan, Area, Tension } from "@/types/chart";

export type ModalItem = VisionItem | RealityItem | ActionPlan;

interface LeftPaneProps {
  itemType: ItemType;
  itemId: string;
  item: ModalItem | null;
  areas: Area[];
  members: { id: string; email: string; name?: string; avatar_url?: string }[];
  currentUser: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  tensions: Tension[];
  chartId: string;
  workspaceId?: string;
  childChartTitle?: string | null;
  onUpdate: (field: string, value: string | boolean | null) => void;
  locale?: string;
  onNavigate?: (itemType: ItemType, itemId: string) => void;
  onActivityChange?: () => void;
}

export function LeftPane({
  itemType,
  itemId,
  item,
  areas,
  members,
  currentUser,
  tensions,
  chartId,
  workspaceId,
  childChartTitle,
  onUpdate,
  locale,
  onNavigate,
  onActivityChange,
}: LeftPaneProps) {
  const t = useTranslations("modal");

  const itemDescription = item
    ? itemType === "action"
      ? (item as ActionPlan).description ?? ""
      : (item as VisionItem | RealityItem).description ?? ""
    : "";
  const [description, setDescription] = useState(itemDescription);

  // item が変わったら（別のアイテムを開いた時）description を同期
  useEffect(() => {
    setDescription(itemDescription);
  }, [itemDescription]);

  if (!item) {
    return (
      <div className="w-full">
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </div>
    );
  }

  const title =
    itemType === "action"
      ? (item as ActionPlan).title ?? ""
      : ((item as VisionItem | RealityItem).content ?? "").slice(0, 200);
  const childChartId = itemType === "action" ? (item as ActionPlan).childChartId : null;

  const handleTitleSave = (newTitle: string) => {
    if (itemType === "action") {
      onUpdate("title", newTitle);
    } else {
      onUpdate("content", newTitle);
    }
  };

  const handleDetailsSave = (newContent: string) => {
    setDescription(newContent);  // ローカル state を即座に更新
    onUpdate("description", newContent);  // DB にも保存
  };

  return (
    <div className="w-full space-y-3">
      <div className="w-full">
        <TitleEditor
        title={title}
        onSave={handleTitleSave}
        placeholder={t("untitled")}
        />
      </div>

      <PropertiesPanel
        itemType={itemType}
        item={item}
        areas={areas}
        members={members}
        currentUser={currentUser}
        tensions={tensions}
        onUpdate={onUpdate}
        locale={locale}
      />

      {itemType === "action" && (
        <ActionDependencies
          chartId={chartId}
          actionId={itemId}
          onNavigate={onNavigate}
          onActivityChange={onActivityChange}
        />
      )}

      <LinkedResources
        chartId={chartId}
        itemType={itemType}
        itemId={itemId}
        onActivityChange={onActivityChange}
      />

      <ItemRelations
        chartId={chartId}
        itemType={itemType}
        itemId={itemId}
        onNavigate={onNavigate}
      />

      <div className="w-full max-w-[800px]">
        <DetailsEditor
          value={description}
          onSave={handleDetailsSave}
          placeholder={t("detailsPlaceholder")}
          chartId={chartId}
          itemTitle={title}
          itemContext={
            itemType === "action"
              ? `Type: Action\nTension: ${(item as unknown as Record<string, string>).tensionTitle || ""}\nStatus: ${(item as ActionPlan).status || "todo"}\nAssignee: ${(item as ActionPlan).assignee || "unassigned"}\nDue: ${(item as ActionPlan).dueDate || "none"}`
              : itemType === "vision"
              ? `Type: Vision`
              : `Type: Reality`
          }
        />
      </div>

      {itemType === "action" && childChartId && (
        <ChildChartLink
          childChartId={childChartId}
          childChartTitle={childChartTitle}
          workspaceId={workspaceId}
        />
      )}

      <ChangeHistorySummary
        chartId={chartId}
        itemType={itemType}
        itemId={itemId}
        tensions={tensions}
        areas={areas}
        locale={locale}
      />
    </div>
  );
}
