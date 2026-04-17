"use client";

import { useTranslations } from "next-intl";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronRight } from "lucide-react";

interface Action {
  id: string;
  title: string;
  due_date: string | null;
  assignee: string | null;
  status: "todo" | "in_progress" | "done" | "pending" | "canceled" | null;
  is_completed: boolean | null;
  tension_id: string | null;
  vision_tags?: string[];
  depth: number;
  parent_action_id: string | null;
  tension_title: string | null;
  tension_area_name: string | null;
  tension_area_color: string | null;
  has_children: boolean;
}

interface KanbanCardProps {
  action: Action;
  isDragging?: boolean;
  onClick?: () => void;
}

export function KanbanCard({ action, isDragging, onClick }: KanbanCardProps) {
  const tc = useTranslations("common");
  const { attributes, listeners, setNodeRef, transform, isDragging: isDraggingState } = useDraggable({
    id: action.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDraggingState ? 0.5 : 1,
  };

  const isOverdue =
    !!action.due_date && !action.is_completed && new Date(action.due_date) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        "group rounded-md border border-zenshin-navy/8 bg-white px-2.5 py-2 cursor-grab active:cursor-grabbing transition-all min-h-[60px] flex flex-col justify-between",
        isDragging && "shadow-lg ring-2 ring-zenshin-teal/30",
        "hover:shadow-sm hover:border-zenshin-navy/15",
        onClick && "cursor-pointer",
        action.depth > 0 && "ml-3 border-l-2 border-l-zenshin-navy/15",
        action.is_completed && "opacity-60"
      )}
    >
      {/* Title */}
      <p
        className={cn(
          "text-[13px] text-zenshin-navy leading-snug line-clamp-2 min-h-[36px]",
          action.is_completed && "line-through text-zenshin-navy/40"
        )}
      >
        {action.title}
      </p>

      {/* Footer: always visible */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[11px]",
            !action.due_date && "text-zenshin-navy/20",
            action.due_date && !isOverdue && "text-zenshin-navy/40",
            isOverdue && "text-red-500 font-medium"
          )}>
            {action.due_date
              ? format(new Date(action.due_date), "MM/dd", { locale: ja })
              : tc("noDate")}
          </span>
          {action.has_children && (
            <ChevronRight className="w-3 h-3 text-zenshin-navy/30" />
          )}
        </div>
        {action.assignee ? (
          <div
            className="w-5 h-5 rounded-full bg-zenshin-teal/15 text-zenshin-teal text-[10px] font-medium flex items-center justify-center shrink-0"
            title={action.assignee}
          >
            {action.assignee.charAt(0).toUpperCase()}
          </div>
        ) : (
          <div
            className="w-5 h-5 rounded-full bg-zenshin-navy/5 shrink-0"
            title={tc("unassigned")}
          />
        )}
      </div>
    </div>
  );
}
