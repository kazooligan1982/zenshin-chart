"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ItemType } from "./ModalHeader";
import type { Tension, Area } from "@/types/chart";
import { logger } from "@/lib/logger";

interface ChartHistoryEntry {
  id: string;
  created_at: string;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  old_value_display?: string | null;
  new_value_display?: string | null;
  user_id?: string | null;
  changed_by_name?: string | null;
}

interface ChangeHistorySummaryProps {
  chartId: string;
  itemType: ItemType;
  itemId: string;
  tensions?: Tension[];
  areas?: Area[];
  locale?: string;
}

function formatHistoryValue(field: string, value: string): string {
  if (!value || value === "—" || value === "") return "";
  if (field === "dueDate" || field === "due_date") {
    try {
      const date = new Date(value);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}/${m}/${d}`;
    } catch {
      return value;
    }
  }
  return value;
}

function formatHistorySummary(
  entry: ChartHistoryEntry,
  t: (key: string, params?: Record<string, string>) => string,
  tensionMap: Map<string, string>,
  areaMap: Map<string, string>
): string {
  if (entry.event_type === "created") {
    return t("itemCreated");
  }
  if (entry.event_type === "deleted") {
    return t("itemDeleted");
  }
  const field = entry.field ?? "";
  const rawNew = entry.new_value_display ?? entry.new_value ?? "";
  const rawOld = entry.old_value_display ?? entry.old_value ?? "";
  const newVal = formatHistoryValue(field, rawNew) || rawNew;
  const oldVal = formatHistoryValue(field, rawOld) || rawOld;
  const fallback = "—";

  if (field === "tension_id") {
    if (rawNew) {
      const newTitle = tensionMap.get(rawNew) ?? rawNew;
      return rawOld
        ? t("historyMovedToTension", { title: newTitle })
        : t("historySetTension", { title: newTitle });
    }
    return t("historyRemovedFromTension");
  }
  if (field === "content" || field === "description" || field === "title") {
    if (rawOld && rawNew) {
      return t("historyTitleChanged", { old: oldVal || fallback, new: newVal || fallback });
    }
    return t("contentChanged");
  }
  if (field === "assignee") {
    const display = !rawNew || rawNew === "—" || rawNew === "" ? t("noAssignee") : newVal;
    return t("assigneeChanged", { name: display });
  }
  if (field === "status") {
    return t("statusChanged", { old: oldVal || fallback, new: newVal || fallback });
  }
  if (field === "dueDate" || field === "due_date") {
    if (rawOld && rawNew) {
      return t("historyDueDateChanged", { old: oldVal || fallback, new: newVal || fallback });
    }
    return t("dueDateChanged", { date: newVal || fallback });
  }
  if (field === "areaId" || field === "area_id") {
    const areaName = rawNew ? (areaMap.get(rawNew) ?? newVal) : newVal;
    return t("categoryChanged", { name: areaName || fallback });
  }
  if (field === "link") {
    if (rawNew) {
      return t("historyLinkAdded", { value: newVal || fallback });
    }
    return t("historyLinkRemoved", { value: oldVal || fallback });
  }
  if (field === "dependency") {
    if (rawNew) {
      return t("historyDependencyAdded", { value: newVal || fallback });
    }
    return t("historyDependencyRemoved", { value: oldVal || fallback });
  }
  return `${field}: ${oldVal || fallback} → ${newVal || fallback}`;
}

export function ChangeHistorySummary({
  chartId,
  itemType,
  itemId,
  tensions = [],
  areas = [],
  locale = "ja",
}: ChangeHistorySummaryProps) {
  const t = useTranslations("modal");
  const [history, setHistory] = useState<ChartHistoryEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const entityType = itemType;
  const displayLimit = isExpanded ? 50 : 5;

  const tensionMap = new Map(tensions.map((t) => [t.id, t.title || "(無題)"]));
  const areaMap = new Map(areas.map((a) => [a.id, a.name || a.id]));

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/charts/${chartId}/chart-history?entityType=${entityType}&entityId=${itemId}&limit=${displayLimit}`
        );
        const data: ChartHistoryEntry[] = res.ok ? await res.json() : [];
        if (!cancelled) setHistory(data);
      } catch (e) {
        if (!cancelled) logger.error("[ChangeHistorySummary] fetch error:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [chartId, itemId, entityType, displayLimit]);

  const dateFnsLocale = locale === "ja" ? ja : undefined;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-500">{t("changeHistory")}</h3>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-400 italic">{t("loading")}</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{t("noHistory")}</p>
      ) : (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          {history.map((entry) => {
            const changedByName = entry.changed_by_name ?? t("unknownUser");
            const description = formatHistorySummary(entry, t, tensionMap, areaMap);
            return (
              <div
                key={entry.id}
                className="text-sm text-muted-foreground truncate overflow-hidden text-ellipsis whitespace-nowrap"
              >
                <span className="text-xs tabular-nums">
                  {format(new Date(entry.created_at), "M/d HH:mm", { locale: dateFnsLocale })}
                </span>
                {" "}
                <span>{changedByName}</span>
                {" — "}
                <span>{description}</span>
              </div>
            );
          })}
          {!isExpanded && history.length >= 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setIsExpanded(true)}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              {t("showAll", { count: history.length })}
            </Button>
          )}
          {isExpanded && history.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronUp className="h-4 w-4 mr-1" />
              {t("collapseHistory")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
