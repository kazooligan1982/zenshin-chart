"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, Check, Search, Workflow, ChevronRight, Ban, AlertTriangle } from "lucide-react";
import {
  getActionDependencies,
  searchChartActions,
  addActionDependency,
  removeActionDependency,
  type ActionDependencyItem,
} from "@/app/workspaces/[wsId]/charts/[id]/actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface ActionDependenciesProps {
  chartId: string;
  actionId: string;
  onNavigate?: (itemType: "action", itemId: string) => void;
  onActivityChange?: () => void;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "todo";
  const colors: Record<string, string> = {
    todo: "bg-gray-400",
    in_progress: "bg-blue-500",
    done: "bg-emerald-500",
    pending: "bg-yellow-500",
    canceled: "bg-gray-300",
  };
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${colors[s] || "bg-gray-400"}`} />
  );
}

function DependencyItem({
  item,
  onNavigate,
  onRemove,
}: {
  item: ActionDependencyItem;
  onNavigate?: (itemType: "action", itemId: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("modal");
  const isCompleted = item.isCompleted === true || item.status === "done" || item.status === "canceled";

  const content = (
    <span className="flex items-center gap-2 truncate flex-1 min-w-0">
      {isCompleted && <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />}
      <span
        className={isCompleted ? "line-through text-muted-foreground" : ""}
        title={item.title}
      >
        {item.title || "(無題)"}
      </span>
      <StatusBadge status={item.status} />
    </span>
  );

  return (
    <li className="flex items-center gap-2 group">
      <button
        type="button"
        onClick={() => onNavigate?.("action", item.actionId)}
        className="flex-1 min-w-0 text-left p-1.5 rounded-md hover:bg-gray-100 text-sm flex items-center gap-2 transition-colors cursor-pointer"
      >
        {content}
      </button>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1 rounded hover:bg-zenshin-navy/10 text-zenshin-navy/40 hover:text-zenshin-navy transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        title={t("removeLink")}
        aria-label={t("removeLink")}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

export function ActionDependencies({
  chartId,
  actionId,
  onNavigate,
  onActivityChange,
}: ActionDependenciesProps) {
  const t = useTranslations("modal");
  const tToast = useTranslations("toast");
  const [data, setData] = useState<{
    blockedBy: ActionDependencyItem[];
    blocking: ActionDependencyItem[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"blocked_by" | "blocking" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; title: string; status: string | null }[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getActionDependencies(chartId, actionId);
      setData(result);
      if (result.blockedBy.length > 0 || result.blocking.length > 0) {
        setIsExpanded(true);
      }
    } catch (error) {
      logger.error("[ActionDependencies] load error:", error);
      setData({ blockedBy: [], blocking: [] });
    } finally {
      setIsLoading(false);
    }
  }, [chartId, actionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!addMode) {
      setSearchResults([]);
      setSearchQuery("");
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchChartActions(chartId, searchQuery);
      setSearchResults(results.filter((a) => a.id !== actionId));
    }, 200);
    return () => clearTimeout(timer);
  }, [chartId, actionId, addMode, searchQuery]);

  const handleAdd = async (relatedActionId: string) => {
    if (!addMode) return;
    setIsAdding(true);
    try {
      await addActionDependency(chartId, actionId, relatedActionId, addMode);
      toast.success(t("dependencyAdded"));
      setAddMode(null);
      setAddOpen(false);
      load();
      onActivityChange?.();
    } catch (error) {
      logger.error("[ActionDependencies] add error:", error);
      toast.error(tToast("error") || "エラーが発生しました");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (dependencyId: string) => {
    try {
      await removeActionDependency(dependencyId, actionId);
      toast.success(t("dependencyRemoved"));
      load();
      onActivityChange?.();
    } catch (error) {
      logger.error("[ActionDependencies] remove error:", error);
      toast.error(tToast("error") || "エラーが発生しました");
    }
  };

  const hasIncompleteBlockers =
    data && data.blockedBy.some((b) => !b.isCompleted && b.status !== "done" && b.status !== "canceled");
  const hasAny = data && (data.blockedBy.length > 0 || data.blocking.length > 0);
  const dependencies = data ? [...data.blockedBy, ...data.blocking] : [];

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        <Workflow className="w-4 h-4" />
        <span>{t("dependencies")}</span>
        {dependencies.length > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{dependencies.length}</span>
        )}
        {hasIncompleteBlockers && (
          <span
            className="w-2 h-2 rounded-full bg-orange-500 shrink-0"
            title={t("blockedBy")}
          />
        )}
      </button>
      {isExpanded && (
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 mt-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <>
            <div className="space-y-4">
              {data!.blockedBy.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5">{t("blockedBy")}</h4>
                  <ul className="space-y-0.5">
                    {data!.blockedBy.map((item) => (
                      <DependencyItem
                        key={item.id}
                        item={item}
                        onNavigate={onNavigate}
                        onRemove={handleRemove}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {data!.blocking.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5">{t("blocking")}</h4>
                  <ul className="space-y-0.5">
                    {data!.blocking.map((item) => (
                      <DependencyItem
                        key={item.id}
                        item={item}
                        onNavigate={onNavigate}
                        onRemove={handleRemove}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {!hasAny && (
              <p className="text-sm text-gray-400 italic">{t("noDependencies")}</p>
            )}

            <div className="space-y-1 pt-1 border-t border-gray-200">
              <Popover open={addOpen && addMode === "blocking"} onOpenChange={(o) => { if (!o) { setAddOpen(false); setAddMode(null); } }}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setAddMode("blocking"); setAddOpen(true); }}
                  >
                    <Ban className="w-3.5 h-3.5 text-red-500" />
                    <span>{t("thisActionBlocks")}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder={t("selectAction")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    <ul className="max-h-48 overflow-y-auto space-y-0.5">
                      {searchResults.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zenshin-navy/5 text-sm truncate disabled:opacity-50 flex items-center gap-2"
                            onClick={() => handleAdd(a.id)}
                            disabled={isAdding}
                          >
                            <StatusBadge status={a.status} />
                            <span className="truncate">{a.title || "(無題)"}</span>
                          </button>
                        </li>
                      ))}
                      {searchResults.length === 0 && (
                        <li className="px-2 py-2 text-sm text-muted-foreground italic">
                          {searchQuery ? t("noResults") : t("typeToSearch")}
                        </li>
                      )}
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={addOpen && addMode === "blocked_by"} onOpenChange={(o) => { if (!o) { setAddOpen(false); setAddMode(null); } }}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setAddMode("blocked_by"); setAddOpen(true); }}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span>{t("thisActionBlockedBy")}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder={t("selectAction")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    <ul className="max-h-48 overflow-y-auto space-y-0.5">
                      {searchResults.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zenshin-navy/5 text-sm truncate disabled:opacity-50 flex items-center gap-2"
                            onClick={() => handleAdd(a.id)}
                            disabled={isAdding}
                          >
                            <StatusBadge status={a.status} />
                            <span className="truncate">{a.title || "(無題)"}</span>
                          </button>
                        </li>
                      ))}
                      {searchResults.length === 0 && (
                        <li className="px-2 py-2 text-sm text-muted-foreground italic">
                          {searchQuery ? t("noResults") : t("typeToSearch")}
                        </li>
                      )}
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
