"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, Send, MessageSquare, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { HistoryItem } from "@/types/chart";
import type { TimelineComment } from "@/types/database";
import { Timeline } from "@/components/action-timeline/Timeline";
import {
  fetchActionComments,
  fetchRealityComments,
  fetchVisionComments,
} from "@/app/workspaces/[wsId]/charts/[id]/actions";

interface ItemDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: "vision" | "reality" | "action";
  itemId: string;
  itemContent: string;
  history: HistoryItem[];
  currentUserId?: string | null;
  currentUser?: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  chartId: string;
  workspaceId?: string;
  onCommentCountChange?: (
    itemType: "vision" | "reality" | "action",
    itemId: string,
    delta: number
  ) => void;
  onAddHistory: (
    itemType: "vision" | "reality" | "action",
    itemId: string,
    content: string,
    type: "update" | "comment",
    updateMainContent: boolean
  ) => Promise<void>;
}

export function ItemDetailPanel({
  isOpen,
  onClose,
  itemType,
  itemId,
  itemContent,
  history,
  currentUserId,
  currentUser,
  chartId,
  workspaceId = "",
  onCommentCountChange,
  onAddHistory,
}: ItemDetailPanelProps) {
  const tEditor = useTranslations("editor");
  const tAction = useTranslations("action");
  const [commentText, setCommentText] = useState("");
  const [updateMainContent, setUpdateMainContent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionComments, setActionComments] = useState<TimelineComment[]>([]);
  const [visionComments, setVisionComments] = useState<TimelineComment[]>([]);
  const [realityComments, setRealityComments] = useState<TimelineComment[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setCommentText("");
      setUpdateMainContent(false);
      setActionComments([]);
      setVisionComments([]);
      setRealityComments([]);
    }
  }, [isOpen]);

  const loadActionComments = useCallback(async () => {
    if (itemType !== "action") return;
    try {
      const comments = await fetchActionComments(itemId);
      setActionComments(comments);
    } catch (error) {
      console.error("コメントの取得に失敗しました:", error);
      setActionComments([]);
    }
  }, [itemId, itemType]);

  const loadVisionComments = useCallback(async () => {
    if (itemType !== "vision") return;
    try {
      const comments = await fetchVisionComments(itemId);
      setVisionComments(comments);
    } catch (error) {
      console.error("コメントの取得に失敗しました:", error);
      setVisionComments([]);
    }
  }, [itemId, itemType]);

  const loadRealityComments = useCallback(async () => {
    if (itemType !== "reality") return;
    try {
      const comments = await fetchRealityComments(itemId);
      setRealityComments(comments);
    } catch (error) {
      console.error("コメントの取得に失敗しました:", error);
      setRealityComments([]);
    }
  }, [itemId, itemType]);

  useEffect(() => {
    if (isOpen && itemType === "action") {
      void loadActionComments();
    }
    if (isOpen && itemType === "vision") {
      void loadVisionComments();
    }
    if (isOpen && itemType === "reality") {
      void loadRealityComments();
    }
  }, [isOpen, itemType, loadActionComments, loadVisionComments, loadRealityComments]);

  const handleActionCommentAdded = useCallback(async () => {
    await loadActionComments();
    onCommentCountChange?.("action", itemId, 1);
  }, [loadActionComments, onCommentCountChange, itemId]);

  const handleActionCommentDeleted = useCallback(async () => {
    await loadActionComments();
    onCommentCountChange?.("action", itemId, -1);
  }, [loadActionComments, onCommentCountChange, itemId]);

  const handleVisionCommentAdded = useCallback(async () => {
    await loadVisionComments();
    onCommentCountChange?.("vision", itemId, 1);
  }, [loadVisionComments, onCommentCountChange, itemId]);

  const handleVisionCommentDeleted = useCallback(async () => {
    await loadVisionComments();
    onCommentCountChange?.("vision", itemId, -1);
  }, [loadVisionComments, onCommentCountChange, itemId]);

  const handleRealityCommentAdded = useCallback(async () => {
    await loadRealityComments();
    onCommentCountChange?.("reality", itemId, 1);
  }, [loadRealityComments, onCommentCountChange, itemId]);

  const handleRealityCommentDeleted = useCallback(async () => {
    await loadRealityComments();
    onCommentCountChange?.("reality", itemId, -1);
  }, [loadRealityComments, onCommentCountChange, itemId]);

  const handleSubmit = async () => {
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddHistory(
        itemType,
        itemId,
        commentText.trim(),
        updateMainContent ? "update" : "comment",
        updateMainContent
      );
      setCommentText("");
      setUpdateMainContent(false);
    } catch (error) {
      console.error("履歴の追加に失敗しました:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "yyyy年MM月dd日 HH:mm", { locale: ja });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/50 z-[9998] transition-opacity"
        onClick={onClose}
      />
      
      {/* サイドパネル */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-[9999] transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <h2 className="text-lg font-semibold">
              {itemType === "vision" && "Vision"}
              {itemType === "reality" && "Reality"}
              {itemType === "action" && "Action"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* メインコンテンツ */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* 現在の内容 */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {tEditor("currentContent")}
                </h3>
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  {itemContent || tAction("noContent")}
                </div>
              </div>

              {/* Activity */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Activity
                </h3>
                {itemType === "action" ? (
                  <>
                    <Timeline
                      type="action"
                      itemId={itemId}
                      initialComments={actionComments}
                      currentUserId={currentUserId ?? ""}
                      currentUser={currentUser}
                      chartId={chartId}
                      workspaceId={workspaceId}
                      onCommentAdded={handleActionCommentAdded}
                      onCommentDeleted={handleActionCommentDeleted}
                    />
                  </>
                ) : itemType === "vision" ? (
                  <>
                    <Timeline
                      type="vision"
                      itemId={itemId}
                      initialComments={visionComments}
                      currentUserId={currentUserId ?? ""}
                      currentUser={currentUser}
                      chartId={chartId}
                      workspaceId={workspaceId}
                      onCommentAdded={handleVisionCommentAdded}
                      onCommentDeleted={handleVisionCommentDeleted}
                    />
                  </>
                ) : itemType === "reality" ? (
                  <>
                    <Timeline
                      type="reality"
                      itemId={itemId}
                      initialComments={realityComments}
                      currentUserId={currentUserId ?? ""}
                      currentUser={currentUser}
                      chartId={chartId}
                      workspaceId={workspaceId}
                      onCommentAdded={handleRealityCommentAdded}
                      onCommentDeleted={handleRealityCommentDeleted}
                    />
                  </>
                ) : history.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    {tAction("noHistory")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="border-l-2 border-primary/30 pl-4 pb-4 last:pb-0"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            {item.type === "update" ? (
                              <Edit className="w-4 h-4 text-primary" />
                            ) : (
                              <MessageSquare className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                {item.type === "update" ? tAction("update") : tAction("comments")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(item.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {item.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* フッター（コメント入力） */}
          {itemType !== "action" && itemType !== "vision" && itemType !== "reality" && (
          <div className="border-t p-4 shrink-0 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="update-main"
                checked={updateMainContent}
                onCheckedChange={(checked) =>
                  setUpdateMainContent(checked === true)
                }
              />
              <label
                htmlFor="update-main"
                className="text-sm font-medium cursor-pointer"
              >
                {tAction("updateMainContent")}
              </label>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={
                  updateMainContent
                    ? tAction("updateContentPlaceholder")
                    : tAction("addComment")
                }
                className="min-h-[80px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Button
                onClick={handleSubmit}
                disabled={!commentText.trim() || isSubmitting}
                size="icon"
                className="h-[80px] w-12 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  );
}

