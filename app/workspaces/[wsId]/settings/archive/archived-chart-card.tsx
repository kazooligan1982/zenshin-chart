"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { restoreChart, deleteChart } from "@/lib/charts-actions";
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

type ArchivedChart = {
  id: string;
  title: string;
  archived_at: string;
};

export function ArchivedChartCard({ chart }: { chart: ArchivedChart }) {
  const t = useTranslations("archive");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleRestore = async () => {
    setIsLoading(true);
    try {
      await restoreChart(chart.id);
      toast.success(tt("chartRestored"), { duration: 3000 });
      router.refresh();
    } catch (error) {
      console.error("Failed to restore chart:", error);
      toast.error(tt("restoreFailed"), { duration: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteDialogOpen(false);
    setIsLoading(true);
    try {
      await deleteChart(chart.id);
      removeChartFromRecent(chart.id);
      toast.success(tt("chartDeleted"), { duration: 3000 });
      router.refresh();
    } catch (error) {
      console.error("Failed to delete chart:", error);
      toast.error(tt("deleteFailed"), { duration: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zenshin-navy/8 p-4 flex items-center justify-between gap-4">
      <div>
        <h3 className="font-medium text-zenshin-navy">{chart.title}</h3>
        <p className="text-sm text-zenshin-navy/40">
          {t("archivedAt", { date: chart.archived_at })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestore}
          disabled={isLoading}
          className="border-zenshin-navy/10 text-zenshin-navy hover:bg-zenshin-cream"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          {t("restore")}
        </Button>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl border-gray-200 shadow-xl max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base font-bold text-zenshin-navy">
                {t("deleteChartConfirm")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-500">
                {t("deleteChartWarning")}
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
      </div>
    </div>
  );
}
