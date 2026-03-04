"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchActionComments,
  checkIncompleteTelescopeActions,
} from "../actions";
import {
  AlertTriangle,
  Circle,
  Clock,
  CheckCircle2,
  Pause,
  XCircle,
  MessageSquare,
  Target,
  Calendar as CalendarIcon,
  Check,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Timeline } from "@/components/action-timeline/Timeline";
import { getCurrentWorkspaceId } from "@/lib/workspace";
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

interface Action {
  id: string;
  title: string;
  due_date: string | null;
  assignee: string | null;
  status: "todo" | "in_progress" | "done" | "pending" | "canceled" | null;
  is_completed: boolean | null;
  tension_id: string | null;
  child_chart_id?: string | null;
  vision_tags?: string[];
  description?: string | null;
}

function AssigneePopover({
  assignee,
  onAssigneeChange,
  workspaceMembers,
  currentUser,
  noAssigneeLabel,
}: {
  assignee: string | null;
  onAssigneeChange: (email: string | null) => void;
  workspaceMembers: { id: string; email: string; name?: string; avatar_url?: string }[];
  currentUser: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  noAssigneeLabel: string;
}) {
  const assigneeMember =
    workspaceMembers.find((m) => m.email === assignee) ??
    (currentUser && assignee === currentUser.email ? currentUser : null);
  const members: { id?: string; email: string; name?: string; avatar_url?: string | null }[] =
    workspaceMembers.length > 0 ? workspaceMembers : currentUser ? [currentUser] : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full h-10 justify-start text-left font-normal bg-background gap-2",
            !assignee && "text-zenshin-navy/40"
          )}
        >
          {assignee ? (
            assigneeMember?.avatar_url ? (
              <img
                src={assigneeMember.avatar_url}
                alt={assigneeMember.name || ""}
                className="h-6 w-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-zenshin-navy text-white text-xs flex items-center justify-center font-medium shrink-0">
                {(assigneeMember?.name || assigneeMember?.email || assignee).charAt(0).toUpperCase()}
              </div>
            )
          ) : (
            <UserPlus className="h-4 w-4 shrink-0 text-zenshin-navy/40" />
          )}
          <span className="truncate">
            {assignee ? (assigneeMember?.name || assigneeMember?.email || assignee) : noAssigneeLabel}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 max-h-[280px] overflow-y-auto p-2 z-50" align="start">
        <div className="space-y-0.5">
          <Button
            variant={!assignee ? "secondary" : "ghost"}
            className="w-full justify-start text-sm h-9 gap-2"
            onClick={() => onAssigneeChange(null)}
          >
            {!assignee ? <Check className="h-4 w-4 shrink-0" /> : <span className="w-4" />}
            {noAssigneeLabel}
          </Button>
          {members.map((member) => (
            <Button
              key={member.email}
              variant={assignee === member.email ? "secondary" : "ghost"}
              className="w-full justify-start text-sm h-9 gap-2"
              onClick={() => onAssigneeChange(member.email)}
            >
              {assignee === member.email ? <Check className="h-4 w-4 shrink-0" /> : <span className="w-4" />}
              {member.avatar_url ? (
                <img
                  src={member.avatar_url}
                  alt={member.name || ""}
                  className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-zenshin-navy text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
                  {(member.name || member.email || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate">{member.name || member.email}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface WorkspaceMember {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface ActionEditModalProps {
  action: Action | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedAction?: {
    id: string;
    title?: string;
    status?: string;
    assignee?: string | null;
    due_date?: string | null;
    is_completed?: boolean | null;
  }) => void;
  onDataRefresh?: () => void;
  projectId: string;
  currentUserId?: string;
  currentUser?: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  workspaceMembers?: WorkspaceMember[];
}

export function ActionEditModal({
  action,
  isOpen,
  onClose,
  onSave,
  onDataRefresh,
  projectId,
  currentUserId = "",
  currentUser = null,
  workspaceMembers = [],
}: ActionEditModalProps) {
  const t = useTranslations("action");
  const tk = useTranslations("kanban");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const te = useTranslations("editor");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"todo" | "in_progress" | "done" | "pending" | "canceled">("todo");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [actionComments, setActionComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    actionTitle: string;
    incompleteCount: number;
    incompleteActions: { id: string; title: string; status: string }[];
    nextStatus: "done" | "canceled";
  } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [deletedCommentIds, setDeletedCommentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      getCurrentWorkspaceId().then((id) => setWorkspaceId(id ?? ""));
    }
  }, [isOpen]);

  const [initializedActionId, setInitializedActionId] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen && action) {
      if (initializedActionId !== action.id) {
        setTitle(action.title || "");
        setStatus(
          (action.status as "todo" | "in_progress" | "done" | "pending" | "canceled") ||
          (action.is_completed ? "done" : "todo")
        );
        setAssignee(action.assignee || null);
        setDueDate(action.due_date || null);
        setDescription(action.description ?? (action as { content?: string | null }).content ?? "");
        setInitializedActionId(action.id);
      }
    }
    if (!isOpen) {
      setInitializedActionId(null);
    }
  }, [isOpen, action, initializedActionId]);

  const loadActionComments = useCallback(async () => {
    if (!action?.id) return;
    setIsLoadingComments(true);
    try {
      const comments = await fetchActionComments(action.id);
      setActionComments(comments);
    } catch (error) {
      console.error("コメントの取得に失敗しました:", error);
      setActionComments([]);
    } finally {
      setIsLoadingComments(false);
    }
  }, [action?.id]);

  useEffect(() => {
    if (isOpen && action?.id) {
      void loadActionComments();
    }
  }, [isOpen, action?.id, loadActionComments]);

  const saveField = useCallback(
    async (
      field: "title" | "status" | "assignee" | "dueDate" | "description",
      value: string | null
    ) => {
      if (!action) return;
      try {
        const res = await fetch(`/api/charts/${projectId}/actions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionId: action.id,
            tensionId: action.tension_id || null,
            field,
            value,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Update failed");
        }
      } catch (error) {
        console.error("Error updating action:", error);
        toast.error(tt("updateFailed"), { duration: 5000 });
      }
    },
    [action, projectId, tt]
  );

  const handleStatusChange = async (v: typeof status) => {
    if (!action) return;
    const nextStatus = v;

    if (
      (nextStatus === "done" || nextStatus === "canceled") &&
      action.child_chart_id
    ) {
      const result = await checkIncompleteTelescopeActions(action.id);
      if (result.hasIncomplete) {
        setConfirmDialog({
          open: true,
          actionTitle: action.title,
          incompleteCount: result.incompleteCount,
          incompleteActions: result.incompleteActions,
          nextStatus,
        });
        return;
      }
    }

    setStatus(nextStatus);
    await saveField("status", nextStatus);
  };

  const handleConfirmStatusChange = async () => {
    if (!confirmDialog) return;
    const nextStatus = confirmDialog.nextStatus;
    setConfirmDialog(null);
    try {
      const res = await fetch(`/api/charts/${projectId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: action!.id,
          tensionId: action!.tension_id || null,
          field: "status",
          value: nextStatus,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Update failed");
      }
      setStatus(nextStatus);
    } catch (error) {
      console.error("Error updating action status:", error);
      toast.error(tt("updateFailed"), { duration: 5000 });
    }
  };

  const handleTitleBlur = () => {
    if (!action || title === action.title) return;
    const trimmed = title.trim();
    if (trimmed !== (action.title || "")) {
      saveField("title", trimmed);
    }
  };

  const descriptionEditor = useEditor(
    {
      content: description,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          bulletList: { keepMarks: true, keepAttributes: false },
          orderedList: { keepMarks: true, keepAttributes: false },
        }),
        Placeholder.configure({ placeholder: t("descriptionPlaceholder") }),
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none min-h-[100px] p-3 border rounded-lg text-sm resize-none",
        },
      },
      onBlur: ({ editor }) => {
        const html = editor.getHTML();
        const value = html === "<p></p>" ? "" : html;
        saveField("description", value === "" ? null : value);
      },
      immediatelyRender: false,
    },
    [isOpen, saveField, t("descriptionPlaceholder")]
  );

  useEffect(() => {
    if (descriptionEditor && description !== undefined) {
      descriptionEditor.commands.setContent(description || "<p></p>", { emitUpdate: false });
    }
  }, [descriptionEditor, description]);

  const handleDueDateSelect = (date: Date | undefined) => {
    const newDate = date ? date.toISOString() : null;
    setDueDate(newDate);
    if (!action) return;
    const currentDate = action.due_date || "";
    if ((newDate || "") !== currentDate) {
      saveField("dueDate", newDate);
    }
  };

  const handleAssigneeChange = (email: string | null) => {
    setAssignee(email);
    if (!action) return;
    const currentAssignee = action.assignee || null;
    if (email !== currentAssignee) {
      saveField("assignee", email);
    }
  };

  if (!action) return null;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            document.querySelectorAll(".mention-dropdown").forEach((el) => el.remove());
            if (onDataRefresh) {
              onDataRefresh();
            } else {
              router.refresh();
            }
            onClose();
          }
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if ((e.target as HTMLElement).closest("[data-sonner-toaster]")) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement).closest("[data-sonner-toaster]")) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-zenshin-teal" />
              {t("editTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
          <div className="space-y-2">
              <Label className="text-sm font-medium">{t("title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder={t("titlePlaceholder")}
                className="h-10"
            />
          </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-zenshin-navy/50">{t("status")}</Label>
                <Select value={status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full h-10 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">
                    <div className="flex items-center gap-2">
                      <Circle className="w-3 h-3 text-zenshin-navy/30" />
                      {tk("todo")}
                    </div>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-blue-500" />
                      {tk("inProgress")}
                    </div>
                  </SelectItem>
                  <SelectItem value="done">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {tk("done")}
                    </div>
                  </SelectItem>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <Pause className="w-3 h-3 text-amber-500" />
                      {tk("pending")}
                    </div>
                  </SelectItem>
                  <SelectItem value="canceled">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3 h-3 text-zenshin-navy/30" />
                      {tk("canceled")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-zenshin-navy/50">{t("dueDate")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-10 justify-start text-left font-normal bg-background",
                        !dueDate && "text-zenshin-navy/40"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate
                        ? format(new Date(dueDate), "yyyy/MM/dd", { locale: ja })
                        : t("notSet")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate ? new Date(dueDate) : undefined}
                      onSelect={(date) => handleDueDateSelect(date ?? undefined)}
                      locale={ja}
                    />
                    {dueDate && (
                      <div className="border-t px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDueDate(null);
                            saveField("dueDate", null);
                          }}
                          className="text-sm text-zenshin-navy/50 hover:text-red-500 transition-colors"
                        >
                          {t("clearDueDate")}
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-zenshin-navy/50">{t("assignee")}</Label>
                <AssigneePopover
                  assignee={assignee}
                  onAssigneeChange={handleAssigneeChange}
                  workspaceMembers={workspaceMembers}
                  currentUser={currentUser}
                  noAssigneeLabel={t("noAssignee")}
                />
              </div>
            </div>

          {action.vision_tags && action.vision_tags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {action.vision_tags.map((tag) => (
                <Badge key={tag} variant="outline" className="bg-zenshin-teal/10 text-zenshin-teal">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("description")}</Label>
              <div className="min-h-[100px] border rounded-lg overflow-hidden [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:p-3">
                <EditorContent editor={descriptionEditor} />
              </div>
            </div>

          {/* タイムライン */}
            <div className="space-y-2 border-t pt-6">
              <Label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-zenshin-navy/50" />
              {t("activity")}
            </Label>
            {isLoadingComments && (
              <div className="text-sm text-zenshin-navy/40">{t("loadingComments")}</div>
            )}
            <Timeline
              type="action"
              itemId={action.id}
              initialComments={actionComments}
              currentUserId={currentUserId}
              currentUser={currentUser}
              chartId={projectId}
              workspaceId={workspaceId}
              onCommentAdded={loadActionComments}
              onCommentDeleted={onDataRefresh}
              onDataRefresh={onDataRefresh}
              deletedCommentIds={deletedCommentIds}
              onCommentDeletedId={(commentId) =>
                setDeletedCommentIds((prev) => new Set(prev).add(commentId))
              }
              onCommentUndo={(commentId) =>
                setDeletedCommentIds((prev) => {
                  const next = new Set(prev);
                  next.delete(commentId);
                  return next;
                })
              }
            />
          </div>

          {/* 閉じるボタン */}
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={onClose}>
              {tc("close")}
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog && (
        <AlertDialog open={confirmDialog.open} onOpenChange={() => setConfirmDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="w-5 h-5" />
                {t("incompleteActionsTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("incompleteActionsDescription", {
                  title: confirmDialog.actionTitle,
                  count: confirmDialog.incompleteCount,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmDialog.incompleteActions.length > 0 && (
              <div className="bg-zenshin-cream/50 rounded-lg p-3">
                <p className="text-xs text-zenshin-navy/50 mb-2">{t("incompleteActionsLabel")}</p>
                <ul className="space-y-1">
                  {confirmDialog.incompleteActions.map((item) => (
                    <li key={item.id} className="text-sm text-zenshin-navy flex items-center gap-2">
                      <Circle className="w-3 h-3 text-zenshin-navy/40" />
                      {item.title}
                    </li>
                  ))}
                  {confirmDialog.incompleteCount > 5 && (
                    <li className="text-xs text-zenshin-navy/50">
                      {t("moreActionsCount", { count: confirmDialog.incompleteCount - 5 })}
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
    </>
  );
}
