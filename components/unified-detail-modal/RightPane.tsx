"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { format } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { History } from "lucide-react";
import { CommentInput } from "@/components/action-timeline/CommentInput";
import { TimelineItem } from "@/components/action-timeline/TimelineItem";
import {
  fetchActionComments,
  fetchVisionComments,
  fetchRealityComments,
} from "@/app/workspaces/[wsId]/charts/[id]/actions";
import { linkifyUrls } from "@/lib/utils";
import type { ItemType } from "./ModalHeader";
import type { TimelineComment } from "@/types/database";
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
  user_id: string | null;
  changed_by_name: string | null;
}

type TimelineEntry =
  | { type: "comment"; data: TimelineComment; timestamp: Date }
  | { type: "change"; data: ChartHistoryEntry; timestamp: Date };

interface RightPaneProps {
  itemType: ItemType;
  itemId: string;
  chartId: string;
  workspaceId?: string;
  currentUser?: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  currentUserId?: string;
  tensions?: Tension[];
  areas?: Area[];
  refreshKey?: number;
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

export function RightPane({
  itemType,
  itemId,
  chartId,
  workspaceId = "",
  currentUser,
  currentUserId: currentUserIdProp,
  tensions = [],
  areas = [],
  refreshKey,
}: RightPaneProps) {
  const t = useTranslations("modal");
  const locale = useLocale();
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [history, setHistory] = useState<ChartHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletedCommentIds, setDeletedCommentIds] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(5);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateFnsLocale = locale === "ja" ? ja : enUS;
  const currentUserId = currentUserIdProp ?? currentUser?.id ?? "";

  const tensionMap = new Map(tensions.map((t) => [t.id, t.title || "(無題)"]));
  const areaMap = new Map(areas.map((a) => [a.id, a.name || a.id]));

  const loadComments = useCallback(async () => {
    try {
      switch (itemType) {
        case "action":
          return await fetchActionComments(itemId);
        case "vision":
          return await fetchVisionComments(itemId);
        case "reality":
          return await fetchRealityComments(itemId);
        default:
          return [];
      }
    } catch (e) {
      logger.error("[RightPane] fetchComments error:", e);
      return [];
    }
  }, [itemType, itemId]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/charts/${chartId}/chart-history?entityType=${itemType}&entityId=${itemId}&limit=100`
      );
      if (!res.ok) return [];
      return (await res.json()) as ChartHistoryEntry[];
    } catch (e) {
      logger.error("[RightPane] fetch chart-history error:", e);
      return [];
    }
  }, [chartId, itemType, itemId]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      const [commentsData, historyData] = await Promise.all([
        loadComments(),
        loadHistory(),
      ]);
      if (!cancelled) {
        setComments(commentsData);
        setHistory(historyData);
        setDisplayCount(5);
      }
      if (!cancelled) setIsLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadComments, loadHistory, refreshKey]);

  const timeline: TimelineEntry[] = [
    ...comments
      .filter((c) => !deletedCommentIds.has(c.id))
      .map((c) => ({
        type: "comment" as const,
        data: c,
        timestamp: new Date(c.created_at),
      })),
    ...history.map((h) => ({
      type: "change" as const,
      data: h,
      timestamp: new Date(h.created_at),
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const olderCount = Math.max(0, timeline.length - displayCount);
  const visibleTimeline = timeline.slice(-displayCount);

  useEffect(() => {
    if (!isLoading && timeline.length > 0) {
      scrollToBottom();
    }
  }, [isLoading, timeline.length, scrollToBottom]);

  const handleCommentAdded = useCallback(() => {
    void loadComments().then(setComments);
    setTimeout(scrollToBottom, 100);
  }, [loadComments, scrollToBottom]);

  const handleCommentDeleted = useCallback(() => {
    void loadComments().then(setComments);
    void loadHistory().then(setHistory);
  }, [loadComments, loadHistory]);

  const handleOptimisticAdd = useCallback((newComment: TimelineComment) => {
    setComments((prev) => [...prev, newComment]);
    setTimeout(() => {
      const el = document.querySelector("[data-timeline-scroll]");
      el?.scrollTo({ top: (el as HTMLElement).scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  const handleAddFailed = useCallback((tempId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== tempId));
  }, []);

  const handleCommentDeletedId = useCallback((id: string) => {
    setDeletedCommentIds((prev) => new Set(prev).add(id));
  }, []);

  const handleCommentUndo = useCallback((id: string) => {
    setDeletedCommentIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDataRefresh = useCallback(() => {
    void loadComments().then(setComments);
    void loadHistory().then(setHistory);
  }, [loadComments, loadHistory]);

  const handleUpdate = useCallback((commentId: string, newContent: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content: newContent } : c))
    );
  }, []);

  const handleShowOlder = () => {
    setDisplayCount((prev) => Math.min(prev + 10, timeline.length));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="text-sm font-medium text-gray-500 mb-4 shrink-0">{t("activity")}</h3>

      <div
        ref={scrollRef}
        data-timeline-scroll
        className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-4"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <>
            {olderCount > 0 && (
              <button
                type="button"
                onClick={handleShowOlder}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {t("showOlderHistory", { count: olderCount })}
              </button>
            )}
            {visibleTimeline.map((entry) => {
              if (entry.type === "comment") {
                return (
                  <TimelineItem
                    key={`comment-${entry.data.id}`}
                    comment={entry.data}
                    currentUserId={currentUserId}
                    chartId={chartId}
                    workspaceId={workspaceId}
                    type={itemType}
                    onDelete={handleCommentDeletedId}
                    onDeleted={handleCommentDeleted}
                    onDataRefresh={handleDataRefresh}
                    onUndo={handleCommentUndo}
                    onUpdated={handleUpdate}
                  />
                );
              }
              const changedByName = entry.data.changed_by_name ?? t("unknownUser");
              const description = formatHistorySummary(
                entry.data,
                t,
                tensionMap,
                areaMap
              );
              return (
                <div
                  key={`change-${entry.data.id}`}
                  className="flex gap-3"
                >
                  <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <History className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-zenshin-navy">
                        {changedByName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(entry.timestamp, "M/d HH:mm", {
                          locale: dateFnsLocale,
                        })}
                      </span>
                    </div>
                    <div
                      className="text-sm text-muted-foreground [&_a]:text-blue-500 [&_a]:underline [&_a]:hover:text-blue-700 [&_a]:cursor-pointer"
                      dangerouslySetInnerHTML={{
                        __html: linkifyUrls(description),
                      }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.tagName === "A") {
                          e.preventDefault();
                          window.open((target as HTMLAnchorElement).href, "_blank");
                        }
                      }}
                      role="presentation"
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {currentUserId && (
        <div className="shrink-0 pt-4 border-t mt-4">
          <CommentInput
            type={itemType}
            itemId={itemId}
            chartId={chartId}
            workspaceId={workspaceId}
            currentUserId={currentUserId}
            currentUser={currentUser}
            onOptimisticAdd={handleOptimisticAdd}
            onPersisted={handleCommentAdded}
            onFailed={handleAddFailed}
          />
        </div>
      )}
    </div>
  );
}
