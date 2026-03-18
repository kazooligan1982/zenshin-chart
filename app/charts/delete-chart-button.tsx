"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteChart } from "./actions";
import { removeChartFromRecent } from "@/lib/recent-charts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteChartButton({ chartId }: { chartId: string }) {
  const tt = useTranslations("toast");
  // Use a ref instead of useState to avoid triggering a React re-render.
  // Re-rendering the component tree (including the Next.js Router) can trigger
  // a React 19 core bug (facebook/react#33580) where conditional use(thenable)
  // in the Router's useActionQueue causes "Rendered more hooks than during the
  // previous render".
  const isDeletingRef = useRef(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  const handleDelete = async () => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;

    // Update button state via DOM to avoid React re-render.
    if (triggerButtonRef.current) {
      triggerButtonRef.current.disabled = true;
    }

    try {
      await deleteChart(chartId);
      removeChartFromRecent(chartId);
      toast.success(tt("chartDeleted"), { duration: 3000 });
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete chart:", error);
      toast.error(tt("deleteFailed"), { duration: 5000 });
      isDeletingRef.current = false;
      if (triggerButtonRef.current) {
        triggerButtonRef.current.disabled = false;
      }
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          ref={triggerButtonRef}
          className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-500 transition-colors"
          title="削除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl border-gray-200 shadow-xl max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold text-zenshin-navy">
            このチャートを削除しますか？
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-500">
            この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="rounded-lg px-4 py-2 text-sm">
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600"
            onClick={handleDelete}
          >
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
