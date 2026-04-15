"use client";

import { useState, useEffect, useMemo, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  ChevronDown,
  Zap,
  Circle,
  CheckCircle2,
  Clock,
  Pause,
  XCircle,
  User,
  UserPlus,
  Calendar,
  Target,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { UnifiedDetailModal } from "@/components/unified-detail-modal/UnifiedDetailModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  checkIncompleteTelescopeActions,
  updateActionStatus,
} from "@/app/workspaces/[wsId]/charts/[id]/actions";

interface TreeNode {
  id: string;
  type: "tension" | "action";
  title: string;
  status?: string | null;
  assignee?: string | null;
  due_date?: string | null;
  tension_id?: string | null;
  area_name?: string | null;
  area_color?: string | null;
  is_completed?: boolean | null;
  child_chart_id?: string | null;
  description?: string | null;
  children: TreeNode[];
}

interface TreeData {
  chart: { id: string; name: string };
  tree: TreeNode[];
}

interface WorkspaceMember {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface TreeViewProps {
  projectId: string;
  statusFilter: string;
  assigneeFilter: string;
  dueDateFilter: string;
  searchQuery: string;
  currentUserId?: string;
  currentUser?: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  workspaceMembers?: WorkspaceMember[];
  workspaceId?: string;
}

export function TreeView({
  projectId,
  statusFilter,
  assigneeFilter,
  dueDateFilter,
  searchQuery,
  currentUserId = "",
  currentUser = null,
  workspaceMembers = [],
  workspaceId,
}: TreeViewProps) {
  const t = useTranslations("tree");
  const tk = useTranslations("kanban");
  const tc = useTranslations("common");
  const ta = useTranslations("action");
  const te = useTranslations("editor");
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [unifiedModal, setUnifiedModal] = useState<{ itemType: "action"; itemId: string } | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: "status" | "assignee" | "due_date" | null;
    direction: "asc" | "desc";
  }>({ key: null, direction: "asc" });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    actionId: string;
    actionTitle: string;
    nextStatus: "done" | "canceled";
    incompleteCount: number;
    incompleteActions: { id: string; title: string; status: string }[];
  } | null>(null);

  useEffect(() => {
    fetchTreeData();
  }, [projectId]);

  const fetchTreeData = async (resetExpanded: boolean = true) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/charts/${projectId}/actions-tree`);
      if (response.ok) {
        const data = await response.json();
        setTreeData(data);
        if (data.tree && resetExpanded) {
          const allIds = collectAllIds(data.tree);
          setExpandedNodes(new Set(allIds));
        }
      } else {
        console.error("[TreeView] API error:", response.status);
      }
    } catch (error) {
      console.error("[TreeView] Fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const collectAllIds = (nodes: TreeNode[]): string[] => {
    const ids: string[] = [];
    nodes.forEach((node) => {
      ids.push(node.id);
      if (node.children.length > 0) {
        ids.push(...collectAllIds(node.children));
      }
    });
    return ids;
  };

  const toggleExpand = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleActionClick = (node: TreeNode, event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(".expand-button") ||
      target.closest(".status-select") ||
      target.closest("button") ||
      target.closest("select")
    ) {
      return;
    }

    if (node.type === "action") {
      setUnifiedModal({ itemType: "action", itemId: node.id });
    }
  };

  const handleSaveAction = async (updatedAction?: {
    id: string;
    title?: string;
    status?: string;
    assignee?: string | null;
    due_date?: string | null;
    is_completed?: boolean | null;
  }) => {
    setUnifiedModal(null);

    if (updatedAction && treeData) {
      setTreeData((prev) => {
        if (!prev) return prev;

        const updateNode = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((node) => {
            if (node.id === updatedAction.id) {
              return {
                ...node,
                title: updatedAction.title ?? node.title,
                status: updatedAction.status ?? node.status,
                assignee: updatedAction.assignee ?? node.assignee,
                due_date: updatedAction.due_date ?? node.due_date,
                is_completed: updatedAction.is_completed ?? node.is_completed,
              };
            }
            if (node.children.length > 0) {
              return { ...node, children: updateNode(node.children) };
            }
            return node;
          });

        return { ...prev, tree: updateNode(prev.tree) };
      });
    }

    fetch(`/api/charts/${projectId}/actions-tree`)
      .then((response) => response.json())
      .then((data) => setTreeData(data))
      .catch((error) =>
        console.error("Failed to refresh tree data:", error)
      );
  };

  const executeStatusChange = async (actionId: string, newStatus: string) => {
    try {
      await updateActionStatus(
        actionId,
        newStatus as "todo" | "in_progress" | "done" | "pending" | "canceled"
      );
      await fetchTreeData(false);
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleStatusChange = async (
    actionId: string,
    newStatus: string,
    actionTitle: string,
    hasChildren: boolean
  ) => {
    if ((newStatus === "done" || newStatus === "canceled") && hasChildren) {
      try {
        const result = await checkIncompleteTelescopeActions(actionId);
        if (result.hasIncomplete) {
          setConfirmDialog({
            open: true,
            actionId,
            actionTitle,
            nextStatus: newStatus as "done" | "canceled",
            incompleteCount: result.incompleteCount,
            incompleteActions: result.incompleteActions,
          });
          return;
        }
      } catch (error) {
        console.error("Failed to check incomplete actions:", error);
      }
    }

    await executeStatusChange(actionId, newStatus);
  };

  const handleConfirmStatusChange = async () => {
    if (!confirmDialog) return;
    await executeStatusChange(confirmDialog.actionId, confirmDialog.nextStatus);
    setConfirmDialog(null);
  };

  const getEffectiveStatus = (status: string | null, isCompleted: boolean | null) =>
    status || (isCompleted ? "done" : "todo");

  const getStatusIcon = (status: string | null, isCompleted: boolean | null) => {
    const effectiveStatus = getEffectiveStatus(status, isCompleted);
    switch (effectiveStatus) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "in_progress":
        return <Clock className="w-4 h-4 text-blue-500" />;
      case "pending":
        return <Pause className="w-4 h-4 text-amber-500" />;
      case "canceled":
        return <XCircle className="w-4 h-4 text-zenshin-navy/40" />;
      default:
        return <Circle className="w-4 h-4 text-zenshin-navy/30" />;
    }
  };

  const isDueDateMatch = (dueDateValue: string | null) => {
    if (dueDateFilter === "all") return true;
    if (!dueDateValue) return dueDateFilter === "no_date";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(today);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const dueDate = new Date(dueDateValue);
    dueDate.setHours(0, 0, 0, 0);

    switch (dueDateFilter) {
      case "overdue":
        return dueDate < today;
      case "today":
        return dueDate.getTime() === today.getTime();
      case "this_week":
        return dueDate <= weekEnd;
      case "this_month":
        return dueDate <= monthEnd;
      default:
        return true;
    }
  };

  const filterAction = (action: TreeNode): boolean => {
    if (action.type !== "action") return false;

    if (statusFilter !== "all") {
      const currentStatus = getEffectiveStatus(
        action.status ?? null,
        action.is_completed ?? null
      );
      if (currentStatus !== statusFilter) return false;
    }

    if (assigneeFilter !== "all") {
      if (assigneeFilter === "unassigned" && action.assignee) return false;
      if (
        assigneeFilter !== "unassigned" &&
        action.assignee !== assigneeFilter
      ) {
        return false;
      }
    }

    if (!isDueDateMatch(action.due_date ?? null)) return false;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const title = action.title || "";
      if (!title.toLowerCase().includes(query)) return false;
    }

    return true;
  };

  const hasMatchingDescendant = (node: TreeNode): boolean => {
    return node.children.some(
      (child) => filterAction(child) || hasMatchingDescendant(child)
    );
  };

  const isNodeVisible = (node: TreeNode) => {
    if (node.type === "action") {
      return filterAction(node) || hasMatchingDescendant(node);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      if (node.title.toLowerCase().includes(query)) return true;
    }
    return hasMatchingDescendant(node);
  };

  const sortedTree = useMemo(() => {
    if (!sortConfig.key || !treeData) return treeData?.tree ?? [];

    const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
      const sorted = [...nodes].sort((a, b) => {
        let aVal = a[sortConfig.key!] || "";
        let bVal = b[sortConfig.key!] || "";

        if (sortConfig.key === "due_date") {
          (aVal as any) = aVal ? new Date(aVal as string).getTime() : Infinity;
          (bVal as any) = bVal ? new Date(bVal as string).getTime() : Infinity;
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });

      return sorted.map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : [],
      }));
    };

    return sortNodes(treeData.tree);
  }, [treeData, sortConfig]);

  const SortableHeader = ({
    label,
    sortKey,
  }: {
    label: string;
    sortKey: "status" | "assignee" | "due_date";
  }) => {
    const isActive = sortConfig.key === sortKey;

    const handleSort = () => {
      if (sortConfig.key === sortKey) {
        setSortConfig({
          key: sortKey,
          direction: sortConfig.direction === "asc" ? "desc" : "asc",
        });
      } else {
        setSortConfig({ key: sortKey, direction: "asc" });
      }
    };

    return (
      <button
        onClick={handleSort}
        className="flex items-center gap-1 text-xs font-medium text-zenshin-navy/50 hover:text-zenshin-navy transition-colors"
      >
        {label}
        {isActive ? (
          sortConfig.direction === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-50" />
        )}
      </button>
    );
  };

  const renderRow = (
    node: TreeNode,
    level: number = 0,
    groupColor?: string | null
  ) => {
    if (!isNodeVisible(node)) return null;

    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isTension = node.type === "tension";
    const isAction = node.type === "action";
    const currentGroupColor = groupColor ?? node.area_color ?? null;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "relative grid grid-cols-[1fr_100px_80px_80px] gap-2 items-center py-2 px-4 border-b text-sm transition-colors",
            isTension && "bg-zenshin-cream/60 font-semibold",
            isAction && "bg-white cursor-pointer hover:bg-zenshin-cream/50"
          )}
          onClick={(event) => handleActionClick(node, event)}
        >
          {currentGroupColor && (
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{ backgroundColor: currentGroupColor }}
            />
          )}
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ paddingLeft: `${level * 24}px` }}
          >
            {hasChildren ? (
              <button
                onClick={(event) => toggleExpand(node.id, event)}
                className="p-0.5 hover:bg-zenshin-navy/10 rounded shrink-0 expand-button"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-zenshin-navy/50" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zenshin-navy/50" />
                )}
              </button>
            ) : (
              <div className="w-5 shrink-0" />
            )}

            {isTension ? (
              <Zap className="w-4 h-4 text-zenshin-navy/60 shrink-0" />
            ) : (
              getStatusIcon(node.status || null, node.is_completed || null)
            )}

            {isTension && node.area_name && (
              <span
                className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 text-white"
                style={{
                  backgroundColor: node.area_color || "#9CA3AF",
                }}
              >
                {node.area_name}
              </span>
            )}

            <span
              className={cn(
                "truncate",
                node.is_completed && "line-through text-zenshin-navy/40"
              )}
            >
              {node.title}
            </span>

          </div>

          <div className="flex items-center justify-center text-zenshin-navy/60 text-xs status-select">
            {isAction && (
              <Select
                value={node.status || (node.is_completed ? "done" : "todo")}
                onValueChange={(value) =>
                  handleStatusChange(
                    node.id,
                    value,
                    node.title,
                    !!node.child_chart_id
                  )
                }
              >
                <SelectTrigger className="h-7 w-auto gap-0.5 px-2 border-0 bg-transparent shadow-none hover:bg-zenshin-navy/5 focus:ring-0 text-xs rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">{tk("todo")}</SelectItem>
                  <SelectItem value="in_progress">{tk("inProgress")}</SelectItem>
                  <SelectItem value="done">{tk("done")}</SelectItem>
                  <SelectItem value="pending">{tk("pending")}</SelectItem>
                  <SelectItem value="canceled">{tk("canceled")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-center">
            {isAction &&
              (node.assignee ? (
              <div
                className="w-5 h-5 rounded-full bg-zenshin-teal/15 text-zenshin-teal text-[10px] font-medium flex items-center justify-center"
                title={node.assignee}
              >
                {node.assignee.charAt(0).toUpperCase()}
              </div>
              ) : (
                <UserPlus className="w-4 h-4 text-zenshin-navy/20" />
              ))}
          </div>

          <div className="text-xs">
            {isAction &&
              node.due_date &&
              (() => {
                const isOverdue = new Date(node.due_date) < new Date();
                return (
                  <span className={cn(isOverdue && "text-red-500 font-medium")}>
                    {format(new Date(node.due_date), "MM/dd", { locale: ja })}
                  </span>
                );
              })()}
          </div>
        </div>

            {isExpanded && hasChildren && (
              <div>
                {node.children.map((child) =>
                  renderRow(child, level + 1, currentGroupColor)
                )}
              </div>
            )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        {[1, 2, 3].map((section) => (
          <div key={section} className="space-y-3">
            {/* Tension header */}
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 bg-zenshin-navy/10 rounded" />
              <div className="h-5 w-48 bg-zenshin-navy/10 rounded" />
              <div className="h-5 w-6 bg-zenshin-navy/6 rounded-full" />
            </div>
            {/* Action items */}
            <div className="ml-8 space-y-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 p-3 bg-white/80 rounded-lg border border-zenshin-navy/8"
                >
                  <div className="h-4 w-4 bg-zenshin-navy/8 rounded" />
                  <div className="h-4 w-2/3 bg-zenshin-navy/8 rounded" />
                  <div className="ml-auto h-5 w-14 bg-zenshin-navy/6 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!treeData) {
    return (
      <div className="text-center text-zenshin-navy/50 py-8">
        {t("fetchError")}
      </div>
    );
  }

  const expandAll = () => {
    if (!treeData) return;
    setExpandedNodes(new Set(collectAllIds(treeData.tree)));
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  return (
    <div className="flex flex-col h-full pl-2">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-zenshin-teal" />
          <span className="font-semibold">{treeData.chart.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-zenshin-navy/60 hover:text-zenshin-navy hover:underline"
          >
            {t("expandAll")}
          </button>
          <span className="text-zenshin-navy/20">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-zenshin-navy/60 hover:text-zenshin-navy hover:underline"
          >
            {t("collapseAll")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_100px_80px_80px] gap-2 items-center px-4 py-2 border-b bg-zenshin-cream/80 text-xs font-medium text-zenshin-navy/50 sticky top-0 z-10">
        <span className="text-xs font-medium text-zenshin-navy/50">{t("title")}</span>
        <SortableHeader label={t("status")} sortKey="status" />
        <SortableHeader label={t("assignee")} sortKey="assignee" />
        <SortableHeader label={t("dueDate")} sortKey="due_date" />
      </div>

      <div className="flex-1 overflow-auto">
        {sortedTree.length > 0 ? (
          sortedTree.map((node) => renderRow(node))
        ) : (
          <div className="text-center text-zenshin-navy/50 py-8">
            {t("noData")}
          </div>
        )}
      </div>

      {unifiedModal && (() => {
        const findNode = (nodes: TreeNode[], id: string): TreeNode | null => {
          for (const node of nodes) {
            if (node.id === id) return node;
            const found = findNode(node.children, id);
            if (found) return found;
          }
          return null;
        };
        const node = treeData ? findNode(treeData.tree, unifiedModal.itemId) : null;
        const item: import("@/types/chart").ActionPlan | null = node
          ? {
              id: node.id,
              title: node.title || "",
              dueDate: node.due_date ?? undefined,
              assignee: node.assignee ?? undefined,
              status: (node.status || (node.is_completed ? "done" : "todo")) as "todo" | "in_progress" | "done" | "pending" | "canceled" | null,
              isCompleted: node.is_completed ?? node.status === "done",
              tension_id: node.tension_id ?? null,
              childChartId: node.child_chart_id ?? undefined,
              description: node.description ?? null,
            }
          : null;
        const handleUpdate = async (field: string, value: string | boolean | null) => {
          const supportedFields = ["title", "status", "assignee", "dueDate", "description"];
          if (!supportedFields.includes(field)) return;
          try {
            const res = await fetch(`/api/charts/${projectId}/actions`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                actionId: unifiedModal.itemId,
                tensionId: node?.tension_id || null,
                field,
                value: value === null ? null : String(value),
              }),
            });
            if (res.ok) void fetchTreeData(false);
          } catch (e) {
            console.error("Update failed:", e);
          }
        };
        return (
          <UnifiedDetailModal
            isOpen={true}
            onClose={() => setUnifiedModal(null)}
            itemType={unifiedModal.itemType}
            itemId={unifiedModal.itemId}
            chartId={projectId}
            workspaceId={workspaceId}
            item={item}
            areas={[]}
            members={workspaceMembers}
            currentUser={currentUser}
            tensions={[]}
            onUpdate={handleUpdate}
          />
        );
      })()}

      {confirmDialog && (
        <AlertDialog
          open={confirmDialog.open}
          onOpenChange={() => setConfirmDialog(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="w-5 h-5" />
                {ta("incompleteActionsTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {ta("incompleteActionsDescription", {
                  title: confirmDialog.actionTitle,
                  count: confirmDialog.incompleteCount,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmDialog.incompleteActions.length > 0 && (
              <div className="bg-zenshin-cream/50 rounded-lg p-3">
                <p className="text-xs text-zenshin-navy/50 mb-2">{ta("incompleteActionsLabel")}</p>
                <ul className="space-y-1">
                  {confirmDialog.incompleteActions.map((action) => (
                    <li
                      key={action.id}
                      className="text-sm text-zenshin-navy flex items-center gap-2"
                    >
                      <Circle className="w-3 h-3 text-zenshin-navy/40" />
                      {action.title}
                    </li>
                  ))}
                  {confirmDialog.incompleteCount > 5 && (
                    <li className="text-xs text-zenshin-navy/50">
                      {ta("moreActionsCount", { count: confirmDialog.incompleteCount - 5 })}
                    </li>
                  )}
                </ul>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmDialog(null)}>
                {tc("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-yellow-600 hover:bg-yellow-700"
                onClick={handleConfirmStatusChange}
              >
                {te("markComplete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
