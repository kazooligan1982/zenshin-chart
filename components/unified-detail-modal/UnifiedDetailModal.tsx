"use client";

import { useEffect, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ModalHeader, type ItemType } from "./ModalHeader";
import { LeftPane, type ModalItem } from "./LeftPane";
import { RightPane } from "./RightPane";
import { cn } from "@/lib/utils";
import type { Area, Tension } from "@/types/chart";

export interface UnifiedDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: ItemType;
  itemId: string;
  chartId: string;
  workspaceId?: string;
  /** Phase 2: 既存データを渡す */
  item?: ModalItem | null;
  areas?: Area[];
  members?: { id: string; email: string; name?: string; avatar_url?: string }[];
  currentUser?: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  /** ログインユーザーID（currentUser?.id のフォールバック用） */
  currentUserId?: string;
  tensions?: Tension[];
  childChartTitle?: string | null;
  onUpdate?: (field: string, value: string | boolean | null) => void;
  locale?: string;
  /** 同タイプのアイテム一覧（▲▼ナビ用） */
  items?: Array<{ id: string; type: ItemType }>;
  /** ナビで別アイテムを開く時のコールバック */
  onNavigate?: (itemType: ItemType, itemId: string) => void;
}

export function UnifiedDetailModal({
  isOpen,
  onClose,
  itemType,
  itemId,
  chartId,
  workspaceId,
  item = null,
  areas = [],
  members = [],
  currentUser = null,
  currentUserId,
  tensions = [],
  childChartTitle = null,
  onUpdate = () => {},
  locale,
  items = [],
  onNavigate,
}: UnifiedDetailModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(60);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const refreshActivity = useCallback(() => {
    setActivityRefreshKey((prev) => prev + 1);
  }, []);
  const isDesktop = useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia("(min-width: 800px)");
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => window.matchMedia("(min-width: 800px)").matches,
    () => false
  );

  // モーダルを閉じる前に、エディタのblur保存を待つ
  const handleClose = useCallback(() => {
    // メンション候補ドロップダウンを確実に削除（Portalでbody直下にあるため）
    document.querySelectorAll(".mention-dropdown").forEach((el) => el.remove());
    // アクティブな要素（DetailsEditorなど）からフォーカスを外して即保存を発火
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    // blur → onSave の伝播を待ってからモーダルを閉じる
    setTimeout(() => {
      onClose();
    }, 100);
  }, [onClose]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const containerWidth = containerRef.current?.offsetWidth || 1;
    const startLeftPx = (leftWidth / 100) * containerWidth;
    const minLeftPx = 500;
    const minRightPx = 500;
    const maxLeftPx = containerWidth - minRightPx;

    function onMouseMove(ev: MouseEvent) {
      const newLeftPx = startLeftPx + (ev.clientX - startX);
      const clampedLeftPx = Math.min(Math.max(newLeftPx, minLeftPx), maxLeftPx);
      const newPercent = (clampedLeftPx / containerWidth) * 100;
      setLeftWidth(newPercent);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unified-modal-title"
    >
      <div
        className={cn(
          "flex flex-col bg-white rounded-xl shadow-2xl",
          "w-[95vw] md:w-[90vw] md:max-w-[1400px] md:min-w-[900px]",
          "h-[85vh] max-h-[90vh]",
          "animate-in zoom-in-95 fade-in duration-200",
          "overflow-hidden"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          itemType={itemType}
          itemId={itemId}
          onClose={handleClose}
          onPrevious={
            items.length > 0 && onNavigate
              ? () => {
                  const idx = items.findIndex((i) => i.id === itemId);
                  if (idx > 0) {
                    const prev = items[idx - 1];
                    onNavigate(prev.type, prev.id);
                  }
                }
              : undefined
          }
          onNext={
            items.length > 0 && onNavigate
              ? () => {
                  const idx = items.findIndex((i) => i.id === itemId);
                  if (idx >= 0 && idx < items.length - 1) {
                    const next = items[idx + 1];
                    onNavigate(next.type, next.id);
                  }
                }
              : undefined
          }
          hasPrevious={
            items.length > 0 ? items.findIndex((i) => i.id === itemId) > 0 : false
          }
          hasNext={
            items.length > 0
              ? items.findIndex((i) => i.id === itemId) < items.length - 1 &&
                items.findIndex((i) => i.id === itemId) >= 0
              : false
          }
        />
        <div
          ref={containerRef}
          className="flex flex-1 min-h-0 md:flex-row flex-col overflow-hidden"
        >
          <div
            style={isDesktop ? { width: `${leftWidth}%`, minWidth: 500 } : undefined}
            className="flex-1 md:flex-initial md:min-w-0 min-h-0 overflow-y-auto overflow-x-hidden outline-none focus:outline-none focus-visible:outline-none"
            tabIndex={-1}
          >
            <div className="px-6 py-4 w-full">
              <LeftPane
            itemType={itemType}
            itemId={itemId}
            item={item}
            areas={areas}
            members={members}
            currentUser={currentUser}
            tensions={tensions}
            chartId={chartId}
            workspaceId={workspaceId}
            childChartTitle={childChartTitle}
            onUpdate={onUpdate}
            locale={locale}
            onNavigate={onNavigate}
            onActivityChange={refreshActivity}
          />
            </div>
          </div>
          <div
            className="hidden md:flex shrink-0 cursor-col-resize relative items-stretch"
            style={{ width: 9 }}
            onMouseDown={handleResizeMouseDown}
            role="separator"
            aria-orientation="vertical"
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
          </div>
          <div
            style={isDesktop ? { width: `${100 - leftWidth}%`, minWidth: 500 } : undefined}
            className="flex-1 md:flex-initial md:min-w-0 min-h-0 flex flex-col overflow-hidden border-l border-border outline-none focus:outline-none focus-visible:outline-none"
            tabIndex={-1}
          >
            <div className="p-6 min-w-0 flex-1 flex flex-col min-h-0">
              <RightPane
                itemType={itemType}
                itemId={itemId}
                chartId={chartId}
                workspaceId={workspaceId}
                currentUser={currentUser}
                currentUserId={currentUserId}
                tensions={tensions}
                areas={areas}
                refreshKey={activityRefreshKey}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : null;
}
