import type { CSSProperties } from "react";
import { pointerWithin, rectIntersection, closestCenter } from "@dnd-kit/core";
import { CheckCircle2, Clock, Pause, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tension, ActionPlan, Area } from "@/types/chart";

// --- 型定義 ---
export type StructuredTension = Tension & {
  actions: ActionPlan[];
};

export type AreaGroup = {
  area: Area;
  tensions: StructuredTension[];
  orphanedActions: ActionPlan[];
};

export type UncategorizedGroup = {
  tensions: StructuredTension[];
  orphanedActions: ActionPlan[];
};

export type StructuredData = {
  categorized: AreaGroup[];
  uncategorized: UncategorizedGroup;
};

// --- CSS定数 ---
export const TEXT_CLASSES = cn(
  "w-full",
  "text-sm",
  "text-zenshin-navy",
  "font-normal",
  "antialiased",
  "bg-transparent",
  "border-0",
  "outline-none",
  "appearance-none",
  "focus:ring-0",
  "focus:outline-none"
);

export const TEXT_FIXED_STYLE: CSSProperties = {
  lineHeight: "1.5rem",
  padding: 0,
  margin: 0,
  boxSizing: "border-box",
};

export const TEXTAREA_CLASSES = cn(TEXT_CLASSES, "resize-none");

export const VIEW_CLASSES = cn(
  TEXT_CLASSES,
  "cursor-text",
  "truncate",
  "whitespace-nowrap"
);

export const iconButtonClass =
  "p-1 rounded-md text-zenshin-navy/40 hover:text-zenshin-navy hover:bg-zenshin-navy/8 transition-colors";
export const ICON_BTN_CLASS =
  "h-8 w-8 flex items-center justify-center rounded-full text-zenshin-navy/40 hover:text-zenshin-navy hover:bg-zenshin-navy/8 transition-colors p-0";
export const ICON_CONTAINER_CLASS = "flex items-center gap-1 shrink-0 h-8 ml-2";

// --- ナビゲーション方向管理 ---
let _lastNavDirection: "up" | "down" | null = null;

export const consumeLastNavDirection = (): "up" | "down" | null => {
  const dir = _lastNavDirection;
  _lastNavDirection = null;
  return dir;
};

export const setLastNavDirection = (dir: "up" | "down") => {
  _lastNavDirection = dir;
};

// --- ユーティリティ関数 ---
export const handleKeyboardNavigation = (e: React.KeyboardEvent) => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  if (e.nativeEvent.isComposing) return;

  const element = e.currentTarget as HTMLTextAreaElement | HTMLInputElement;
  const scope = element.closest("[data-nav-scope]");

  if (!scope) {
    return;
  }

  const inputs = Array.from(scope.querySelectorAll(".keyboard-focusable"));
  const currentIndex = inputs.indexOf(element);
  const selectionStart = element.selectionStart ?? 0;
  const valueLength = element.value?.length ?? 0;

  if (e.key === "ArrowUp") {
    if (selectionStart === 0 && currentIndex > 0) {
      e.preventDefault();
      const target = inputs[currentIndex - 1] as HTMLElement;
      setLastNavDirection("up");
      target.focus();
      if ("setSelectionRange" in target) {
        setTimeout(() => {
          const len = (target as HTMLInputElement).value?.length ?? 0;
          (target as HTMLInputElement).setSelectionRange(len, len);
        }, 0);
      }
    }
  }

  if (e.key === "ArrowDown") {
    if (selectionStart === valueLength && currentIndex < inputs.length - 1) {
      e.preventDefault();
      const target = inputs[currentIndex + 1] as HTMLElement;
      setLastNavDirection("down");
      target.focus();
      if ("setSelectionRange" in target) {
        setTimeout(() => {
          (target as HTMLInputElement).setSelectionRange(0, 0);
        }, 0);
      }
    }
  }
};

export const handleTextKeyboardNavigation = (e: React.KeyboardEvent) => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  if (e.nativeEvent.isComposing) return;

  const element = e.currentTarget as HTMLTextAreaElement | HTMLInputElement;
  const scope = element.closest("[data-nav-scope]");
  if (!scope) return;

  const inputs = Array.from(
    scope.querySelectorAll(".keyboard-focusable")
  ) as Array<HTMLInputElement | HTMLTextAreaElement>;
  const currentIndex = inputs.indexOf(element);
  const selectionStart = element.selectionStart ?? 0;
  const valueLength = element.value?.length ?? 0;

  if (e.key === "ArrowDown") {
    if (selectionStart < valueLength) {
      e.preventDefault();
      element.setSelectionRange(valueLength, valueLength);
    } else if (currentIndex < inputs.length - 1) {
      e.preventDefault();
      const nextInput = inputs[currentIndex + 1];
      setLastNavDirection("down");
      nextInput.focus();
      if ("setSelectionRange" in nextInput) {
        setTimeout(() => {
          nextInput.setSelectionRange(0, 0);
        }, 0);
      }
    }
  }

  if (e.key === "ArrowUp") {
    if (selectionStart > 0) {
      e.preventDefault();
      element.setSelectionRange(0, 0);
    } else if (currentIndex > 0) {
      e.preventDefault();
      const prevInput = inputs[currentIndex - 1];
      setLastNavDirection("up");
      prevInput.focus();
      if ("setSelectionRange" in prevInput) {
        setTimeout(() => {
          const len = prevInput.value?.length ?? 0;
          prevInput.setSelectionRange(len, len);
        }, 0);
      }
    }
  }
};

export const customCollisionDetection = (
  args: Parameters<typeof closestCenter>[0]
) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;

  return closestCenter(args);
};

/** Returns timestamp at local midnight for date comparison (avoids timezone issues with YYYY-MM-DD). */
function toLocalMidnight(dateStr: string): number {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Sorts items: future due_date first (ascending), then past/none by display_order (or sort_order). */
export function sortItemsByFutureDateFirst<T extends { id: string }>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
  getOrder: (item: T) => number = (item) => (item as { sort_order?: number; display_order?: number }).sort_order ?? (item as { sort_order?: number; display_order?: number }).display_order ?? 0,
  descending: boolean = false
): T[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nowMs = now.getTime();
  const future = items
    .filter((item) => {
      const d = getDate(item);
      if (!d) return false;
      const ms = toLocalMidnight(d);
      return !Number.isNaN(ms) && ms >= nowMs;
    })
    .sort((a, b) => descending
      ? toLocalMidnight(getDate(b)!) - toLocalMidnight(getDate(a)!)
      : toLocalMidnight(getDate(a)!) - toLocalMidnight(getDate(b)!));
  const pastOrNone = items
    .filter((item) => {
      const d = getDate(item);
      if (!d) return true;
      const ms = toLocalMidnight(d);
      return Number.isNaN(ms) || ms < nowMs;
    })
    .sort((a, b) => getOrder(a) - getOrder(b));
  return [...future, ...pastOrNone];
}

export const splitItemsByDate = <T extends { id: string }>(
  items: T[],
  getDate: (item: T) => string | null | undefined
) => {
  const datedItems = items
    .filter((item) => !!getDate(item))
    .sort(
      (a, b) =>
        new Date(getDate(b)!).getTime() - new Date(getDate(a)!).getTime()
    );
  const undatedItems = items
    .filter((item) => !getDate(item))
    .sort(
      (a, b) =>
        ((a as unknown as Record<string, number>).sort_order ?? 0) - ((b as unknown as Record<string, number>).sort_order ?? 0)
    );
  const indexById = new Map(
    [...datedItems, ...undatedItems].map((item, index) => [item.id, index])
  );
  return { datedItems, undatedItems, indexById };
};

// --- Actionステータスヘルパー ---
export const getActionStatusIcon = (
  status: ActionPlan["status"],
  isCompleted?: boolean
) => {
  if (isCompleted || status === "done") {
    return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  }
  switch (status) {
    case "in_progress":
      return <Clock className="w-4 h-4 text-blue-500" />;
    case "pending":
      return <Pause className="w-4 h-4 text-yellow-500" />;
    case "canceled":
      return <XCircle className="w-4 h-4 text-zenshin-navy/40" />;
    default:
      return <Circle className="w-4 h-4 text-zenshin-navy/40" />;
  }
};

export const getActionStatusLabel = (
  status: ActionPlan["status"],
  isCompleted?: boolean
) => {
  if (isCompleted || status === "done") return "完了";
  switch (status) {
    case "in_progress":
      return "進行中";
    case "pending":
      return "保留";
    case "canceled":
      return "中止";
    default:
      return "未着手";
  }
};
