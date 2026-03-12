"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  FileText,
  Tag,
  Trash2,
  UserPlus,
  Telescope,
  Circle,
  Clock,
  CheckCircle2,
  Pause,
  XCircle,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
import { MemberAvatar } from "@/components/member-avatar";
import { toast } from "sonner";
import { useItemInput } from "@/hooks/use-item-input";
import type { ActionPlan, Tension, Area } from "@/types/chart";
import {
  ICON_BTN_CLASS,
  ICON_CONTAINER_CLASS,
  handleKeyboardNavigation,
  consumeLastNavDirection,
  getActionStatusIcon,
} from "../editor-utils";
import { moveActionToTension, checkIncompleteTelescopeActions } from "../actions";

const DatePicker = dynamic(
  () => import("@/components/ui/date-picker").then((mod) => mod.DatePicker),
  { loading: () => null, ssr: false }
);

export function SortableActionItem({
  actionPlan,
  actionIndex,
  tensionId,
  parentTensionAreaId,
  hideAreaBadge = false,
  availableTensions,
  isCompleted,
  handleUpdateActionPlan,
  handleDeleteActionPlan,
  handleTelescopeClick,
  telescopingActionId,
  currentUser,
  areas,
  chartId,
  onOpenDetailPanel,
  disabled = false,
  allTensions = [],
  handleOptimisticMove,
  workspaceMembers = [],
}: {
  actionPlan: ActionPlan;
  actionIndex: number;
  tensionId: string | null;
  parentTensionAreaId?: string | null;
  hideAreaBadge?: boolean;
  availableTensions?: Tension[];
  allTensions?: Tension[];
  isCompleted: boolean;
  handleUpdateActionPlan: (
    tensionId: string | null,
    actionId: string,
    field:
      | "title"
      | "dueDate"
      | "assignee"
      | "status"
      | "hasSubChart"
      | "subChartId"
      | "childChartId"
      | "isCompleted"
      | "status"
      | "description"
      | "areaId",
    value: string | boolean | null,
    options?: { removeFromTension?: boolean }
  ) => Promise<void>;
  handleDeleteActionPlan: (tensionId: string | null, actionId: string) => Promise<void>;
  handleTelescopeClick: (actionPlan: ActionPlan, tensionId: string | null) => Promise<void>;
  telescopingActionId: string | null;
  currentUser: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  areas: Area[];
  chartId: string;
  onOpenDetailPanel: (itemType: "action", itemId: string, itemContent: string) => void;
  disabled?: boolean;
  handleOptimisticMove?: (sourceTensionId: string, targetTensionId: string, action: ActionPlan) => void;
  workspaceMembers?: { id: string; email: string; name?: string; avatar_url?: string }[];
}) {
  const t = useTranslations("editor");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const tAction = useTranslations("action");
  const tTags = useTranslations("tags");
  const tk = useTranslations("kanban");
  const actionInput = useItemInput({
    initialValue: actionPlan.title || "",
    onSave: (val) => {
      if (val !== actionPlan.title) {
        handleUpdateActionPlan(tensionId, actionPlan.id, "title", val);
      }
    },
    index: actionIndex,
    sectionId: `action-${tensionId || "loose"}`,
    alwaysEditing: true,
  });

  const actionTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = actionTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [actionInput.value]);

  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const assigneeMember = workspaceMembers.find((m) => m.email === actionPlan.assignee);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isDraggingThis,
  } = useSortable({
    id: actionPlan.id,
    disabled,
    data: {
      type: "action-item",
      areaId: actionPlan.area_id || null,
    },
  });

  const style = {
    transform: disabled ? undefined : CSS.Transform.toString(transform),
    transition: disabled ? undefined : transition,
    opacity: isDraggingThis ? 0.5 : 1,
  };
  const actionArea = areas.find((area) => area.id === actionPlan.area_id) || null;
  const actionAreaName = actionArea?.name ?? tTags("untagged");
  const actionAreaColor = actionArea?.color ?? "#9CA3AF";
  const isDifferentFromParent =
    !hideAreaBadge &&
    parentTensionAreaId !== undefined &&
    (actionPlan.area_id ?? null) !== (parentTensionAreaId ?? null);
  const [isMovingToTension, setIsMovingToTension] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [incompleteDialog, setIncompleteDialog] = useState<{
    isOpen: boolean;
    actionId: string;
    actionTitle: string;
    newStatus: string;
    incompleteCount: number;
    incompleteActions: { id: string; title: string; status: string }[];
  } | null>(null);
  const currentStatus =
    actionPlan.status || (isCompleted ? "done" : "todo");
  const router = useRouter();
  const handleChangeArea = async (newAreaId: string | null) => {
    await handleUpdateActionPlan(tensionId, actionPlan.id, "areaId", newAreaId, {
      removeFromTension: false,
    });
  };

  const handleMoveToTension = async (targetTensionId: string) => {
    setIsMovingToTension(true);

    // 楽観的UI更新: ソースから削除、ターゲットに追加
    const movedAction = { ...actionPlan };
    if (tensionId) {
      handleOptimisticMove?.(tensionId, targetTensionId, movedAction);
    }

    // 即座にトースト表示
    const targetTension = allTensions.find((t) => t.id === targetTensionId);
    toast.success(tt("movedToTension", { name: targetTension?.title || "Tension" }), { duration: 3000 });

    // バックグラウンドでサーバー更新
    const result = await moveActionToTension(actionPlan.id, targetTensionId, chartId);
    if (!result.success) {
      toast.error(tt("moveFailedRevert"), { duration: 5000 });
      router.refresh();
    }
    setIsMovingToTension(false);
  };

  const executeStatusChange = async (nextStatus: string) => {
    await handleUpdateActionPlan(tensionId, actionPlan.id, "status", nextStatus);
  };

  const handleStatusChange = async (nextStatus: string) => {
    if (nextStatus === currentStatus) return;
    if (
      (nextStatus === "done" || nextStatus === "canceled") &&
      actionPlan.childChartId
    ) {
      try {
        const result = await checkIncompleteTelescopeActions(actionPlan.id);
        if (result.hasIncomplete) {
          setIncompleteDialog({
            isOpen: true,
            actionId: actionPlan.id,
            actionTitle: actionPlan.title || t("noTitle"),
            newStatus: nextStatus,
            incompleteCount: result.incompleteCount,
            incompleteActions: result.incompleteActions,
          });
          return;
        }
      } catch (error) {
        console.error("Failed to check incomplete actions:", error);
      }
    }

    await executeStatusChange(nextStatus);
  };

  const handleStatusSelect = async (nextStatus: string) => {
    setIsStatusOpen(false);
    await handleStatusChange(nextStatus);
  };

  const handleConfirmStatusChange = async () => {
    if (!incompleteDialog) return;
    await executeStatusChange(incompleteDialog.newStatus);
    setIncompleteDialog(null);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group flex items-center gap-2 py-1.5 px-2 border-b border-zenshin-navy/5",
          actionInput.isFocused ? "bg-zenshin-cream/50" : "bg-white",
          actionIndex === 0 && "border-t border-zenshin-navy/5",
          isCompleted && "opacity-60"
        )}
      >
      {disabled ? (
        <div className="mr-1 w-4 h-4" />
      ) : (
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mr-1">
          <GripVertical className="w-4 h-4 text-zenshin-navy/30 hover:text-zenshin-navy/50" />
        </div>
      )}
      <div
        className="flex items-center"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Popover open={isStatusOpen} onOpenChange={setIsStatusOpen}>
          <PopoverTrigger asChild>
            <button
              className="shrink-0 p-1 rounded-full hover:bg-zenshin-navy/8 transition-colors"
              title={t("changeStatus")}
            >
              {getActionStatusIcon(actionPlan.status || null, isCompleted)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1 z-50" align="start">
            {[
              { value: "todo", label: tk("todo"), icon: <Circle className="w-4 h-4 text-zenshin-navy/40" /> },
              { value: "in_progress", label: tk("inProgress"), icon: <Clock className="w-4 h-4 text-blue-500" /> },
              { value: "done", label: tk("done"), icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
              { value: "pending", label: tk("pending"), icon: <Pause className="w-4 h-4 text-yellow-500" /> },
              { value: "canceled", label: tk("canceled"), icon: <XCircle className="w-4 h-4 text-zenshin-navy/40" /> },
            ].map((statusOption) => (
              <button
              key={statusOption.value}
                onClick={() => {
                  handleStatusSelect(statusOption.value);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-zenshin-navy/8",
                  currentStatus === statusOption.value && "bg-zenshin-navy/8"
                )}
              >
                {statusOption.icon}
                {statusOption.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <span
        className={`text-[11px] font-mono text-zenshin-navy/35 w-5 text-right shrink-0 leading-5 ${
          isCompleted ? "opacity-60" : ""
        }`}
      >
        {actionIndex + 1}
      </span>
      {!hideAreaBadge && (
        <Badge
          variant="outline"
          className={`text-[10px] h-6 inline-flex items-center px-2 shrink-0 ${
            isDifferentFromParent ? "ring-2 ring-yellow-400" : ""
          }`}
          style={{
            minHeight: "1.5rem",
            backgroundColor: `${actionAreaColor}20`,
            borderColor: actionAreaColor,
            color: actionAreaColor,
          }}
          title={isDifferentFromParent ? t("differentParentCategory") : undefined}
        >
          {actionAreaName}
        </Badge>
      )}
      <div className="flex-1 min-w-0">
        <Textarea
          {...actionInput.bind}
          placeholder={t("actionPlaceholder")}
          rows={1}
          className={cn(
            "text-sm w-full border-none shadow-none focus-visible:ring-0 bg-transparent keyboard-focusable resize-none leading-5 min-h-0 py-0 px-0 overflow-hidden",
            isCompleted && "line-through text-zenshin-navy/40"
          )}
          ref={(el) => {
            actionTextareaRef.current = el;
            if (el) {
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }
          }}
          onFocus={(e) => {
            actionInput.handleFocus();
            const dir = consumeLastNavDirection();
            if (dir) {
              const el = e.currentTarget;
              setTimeout(() => {
                const len = el.value?.length ?? 0;
                el.setSelectionRange(
                  dir === "up" ? len : 0,
                  dir === "up" ? len : 0
                );
              }, 0);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              handleKeyboardNavigation(e);
              return;
            }
            actionInput.handleKeyDown(e);
          }}
        />
      </div>
      <div className={cn(ICON_CONTAINER_CLASS, isCompleted ? "opacity-60" : "")}>
        <div
          className="w-[110px] relative flex items-center justify-center rounded-md cursor-pointer transition-all duration-200 p-1 hover:bg-zenshin-navy/8 hover:ring-1 hover:ring-gray-200"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DatePicker
            value={actionPlan.dueDate || null}
            onChange={(date) => {
              handleUpdateActionPlan(tensionId, actionPlan.id, "dueDate", date || "");
            }}
            className="flex items-center justify-center"
          />
        </div>
        <div className="w-[36px] flex justify-center">
          <Popover
            open={assigneePopoverOpen}
            onOpenChange={setAssigneePopoverOpen}
          >
            <PopoverTrigger asChild>
              <div
                className={cn(
                  "relative group/avatar cursor-pointer flex items-center justify-center rounded-md transition-all duration-200 p-1 hover:bg-zenshin-navy/8 hover:ring-1 hover:ring-gray-200",
                  actionPlan.assignee
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                )}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className={ICON_BTN_CLASS}
                  title={actionPlan.assignee || t("selectAssignee")}
                >
                {actionPlan.assignee ? (
                  assigneeMember?.avatar_url ? (
                    <img
                      src={assigneeMember.avatar_url}
                      alt={assigneeMember.name || ""}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-zenshin-navy text-white text-[10px] flex items-center justify-center font-medium">
                      {(assigneeMember?.name || assigneeMember?.email || actionPlan.assignee).charAt(0).toUpperCase()}
                    </div>
                  )
                ) : (
                  <UserPlus className="w-3 h-3 text-muted-foreground" />
                )}
                </Button>
                {actionPlan.assignee && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateActionPlan(tensionId, actionPlan.id, "assignee", "");
                      setAssigneePopoverOpen(false);
                    }}
                    className="absolute -top-1 -right-1 hidden group-hover/avatar:flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 text-white text-[10px] hover:bg-gray-600 transition-colors z-10"
                    title={t("clearAssignee")}
                  >
                    ×
                  </button>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              className="!w-56 max-w-56 max-h-[240px] overflow-y-auto overflow-x-hidden p-2 z-50"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-0.5">
                {/* 担当者なし */}
                <button
                  className={cn(
                    "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs hover:bg-gray-100 transition-colors",
                    !actionPlan.assignee && "bg-gray-100"
                  )}
                  onClick={() => {
                    handleUpdateActionPlan(tensionId, actionPlan.id, "assignee", "");
                    setAssigneePopoverOpen(false);
                  }}
                >
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {!actionPlan.assignee && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="w-5 h-5 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-gray-500">{tAction("noAssignee")}</span>
                </button>

                {/* メンバー一覧 */}
                {(workspaceMembers.length > 0 ? workspaceMembers : (currentUser ? [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, avatar_url: currentUser.avatar_url }] : [])).map((member) => {
                  const isSelected = actionPlan.assignee === member.email;
                  const displayName = member.name || member.email || "?";
                  return (
                    <button
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs hover:bg-gray-100 transition-colors",
                        isSelected && "bg-gray-100"
                      )}
                      onClick={() => {
                        handleUpdateActionPlan(tensionId, actionPlan.id, "assignee", member.email);
                        setAssigneePopoverOpen(false);
                      }}
                    >
                      <span className="w-4 h-4 flex items-center justify-center shrink-0">
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <MemberAvatar name={displayName} avatarUrl={member.avatar_url} />
                      <span className="truncate min-w-0 flex-1 text-left">{displayName}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className={cn(ICON_CONTAINER_CLASS, "ml-0")}>
          <div className="relative flex items-center justify-center h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className={ICON_BTN_CLASS}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetailPanel("action", actionPlan.id, actionInput.value);
              }}
              title={t("detailHistory")}
            >
              <FileText size={16} />
            </Button>
            {(actionPlan.comment_count ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-zenshin-teal px-1 text-[10px] font-bold text-white ring-2 ring-white pointer-events-none z-10">
                {(actionPlan.comment_count ?? 0) > 99 ? "99+" : actionPlan.comment_count ?? 0}
              </span>
            )}
          </div>
          {!tensionId && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`${ICON_BTN_CLASS} opacity-0 group-hover:opacity-100 transition-opacity`}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  title={t("changeTag")}
                >
                  <Tag size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-1">
                  {areas.map((area) => (
                    <Button
                      key={area.id}
                      variant={actionPlan.area_id === area.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-xs h-7"
                      onClick={() => handleChangeArea(area.id)}
                    >
                      {area.name}
                    </Button>
                  ))}
                  <Button
                    variant={actionPlan.area_id ? "ghost" : "secondary"}
                    className="w-full justify-start text-xs h-7 text-muted-foreground"
                    onClick={() => handleChangeArea(null)}
                  >
                    {tTags("untagged")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <div
            className={cn(
              "flex items-center justify-center rounded-md cursor-pointer transition-all duration-200 p-0.5",
              actionPlan.childChartId || actionPlan.hasSubChart
                ? "bg-zenshin-navy/10 ring-1 ring-zenshin-navy/30"
                : "hover:bg-zenshin-navy/8 hover:ring-1 hover:ring-gray-200 opacity-0 group-hover:opacity-100"
            )}
          >
            <Button
              onClick={() => handleTelescopeClick(actionPlan, tensionId)}
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 shrink-0 transition-opacity hover:bg-transparent rounded-full p-0",
                actionPlan.childChartId || actionPlan.hasSubChart
                  ? "text-zenshin-navy opacity-100"
                  : "text-zenshin-navy/40 hover:text-gray-600"
              )}
              disabled={telescopingActionId === actionPlan.id}
              title={
                actionPlan.childChartId || actionPlan.hasSubChart
                  ? t("telescopeCharted")
                  : t("telescope")
              }
            >
              {telescopingActionId === actionPlan.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Telescope size={16} />
              )}
            </Button>
          </div>
          {/* Tension間移動メニュー */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-zenshin-navy/40 hover:text-gray-600 hover:bg-transparent rounded-full p-0 shrink-0 transition-opacity opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
                title={t("moveToAnotherTension")}
              >
                <ArrowRightLeft size={14} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
              <div className="text-xs font-semibold text-zenshin-navy/50 mb-2 px-2">{t("selectTargetTension")}</div>
              <div className="space-y-0.5 max-h-60 overflow-y-auto">
                {allTensions
                  .filter((t) => t.id !== tensionId && t.status !== "resolved")
                  .map((tension) => {
                    const tArea = areas.find((a) => a.id === tension.area_id);
                    return (
                      <Button
                        key={tension.id}
                        variant="ghost"
                        className="w-full justify-start text-xs h-auto py-2 px-2"
                        onClick={() => handleMoveToTension(tension.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {tArea && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tArea.color }}
                            />
                          )}
                          <span className="truncate">{tension.title || t("noTitleTension")}</span>
                        </div>
                      </Button>
                    );
                  })}
                {allTensions.filter((t) => t.id !== tensionId && t.status !== "resolved").length === 0 && (
                  <div className="text-xs text-zenshin-navy/40 px-2 py-2">{t("noOtherTensions")}</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zenshin-navy/40 hover:text-gray-600 hover:bg-transparent rounded-full p-0 shrink-0 transition-opacity opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteActionPlan(tensionId, actionPlan.id);
            }}
            title={tc("delete")}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      </div>
      <AlertDialog
        open={incompleteDialog?.isOpen || false}
        onOpenChange={(open) => !open && setIncompleteDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-5 h-5" />
              {tAction("incompleteActionsTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {tAction("incompleteActionsDescription", {
                    title: incompleteDialog?.actionTitle ?? "",
                    count: incompleteDialog?.incompleteCount ?? 0,
                  })}
                </p>
                {incompleteDialog?.incompleteActions &&
                  incompleteDialog.incompleteActions.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-zenshin-navy/50 mb-2">
                        {tAction("incompleteActionsLabel")}
                      </p>
                      <ul className="space-y-1">
                        {incompleteDialog.incompleteActions.map((action) => (
                          <li
                            key={action.id}
                            className="text-sm text-gray-700 flex items-center gap-2"
                          >
                            <Circle className="w-3 h-3 text-zenshin-navy/40 shrink-0" />
                            <span className="line-clamp-2 break-words">{action.title}</span>
                          </li>
                        ))}
                        {incompleteDialog.incompleteCount > 5 && (
                          <li className="text-xs text-zenshin-navy/50 pl-5">
                            {tAction("moreActionsCount", { count: incompleteDialog.incompleteCount - 5 })}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                <p className="text-sm">
                  このまま「
                  {incompleteDialog?.newStatus === "done" ? tk("done") : tk("canceled")}
                  」にしますか？
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusChange}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {incompleteDialog?.newStatus === "done"
                ? t("confirmDone")
                : t("confirmCanceled")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
