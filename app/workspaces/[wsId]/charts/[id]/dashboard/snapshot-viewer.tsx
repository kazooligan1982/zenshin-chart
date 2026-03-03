"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja, enUS } from "date-fns/locale";

interface Snapshot {
  id: string;
  created_at: string;
  snapshot_type: string;
  description?: string | null;
  versionNumber?: string;
}

interface SnapshotViewerProps {
  snapshot: Snapshot;
  autoOpen?: boolean;
}

interface SnapshotDetail {
  id: string;
  chart_id: string;
  created_at: string;
  snapshot_type: string;
  description?: string | null;
  data: {
    visions?: any[];
    realities?: any[];
    tensions?: any[];
    tension_visions?: any[];
    tension_realities?: any[];
    actions?: any[];
  };
}

export function SnapshotViewer({ snapshot, autoOpen = false }: SnapshotViewerProps) {
  const t = useTranslations("snapshot");
  const currentLocale = useLocale();
  const dateLocale = currentLocale === "ja" ? ja : enUS;
  const [isOpen, setIsOpen] = useState(false);
  const [detailData, setDetailData] = useState<SnapshotDetail | null>(null);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setIsOpen(true);
    setIsLoading(true);
    setError(null);
    setDetailData(null);

    try {
      const { data, error } = await supabase
        .from("snapshots")
        .select("*")
        .eq("id", snapshot.id)
        .single();

      if (error) {
        console.error("[SnapshotViewer] Error fetching detail:", error);
        setError(error.message);
        return;
      }

      setDetailData(data as SnapshotDetail);
    } catch (err) {
      console.error("[SnapshotViewer] Error fetching detail:", err);
      setError(err instanceof Error ? err.message : t("fetchDataFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoOpen) {
      handleOpen();
    }
  }, [autoOpen]);

  const handleClose = () => {
    setIsOpen(false);
    setDetailData(null);
    setError(null);
  };

  const getStats = () => {
    if (!detailData?.data) return null;

    const { visions, realities, tensions, actions } = detailData.data;
    return {
      visions: visions?.length || 0,
      realities: realities?.length || 0,
      tensions: tensions?.length || 0,
      actions: actions?.length || 0,
    };
  };

  const stats = getStats();

  return (
    <>
      <Button
        onClick={handleOpen}
        className="text-xs bg-zenshin-navy text-white px-3 py-1.5 rounded-lg hover:bg-zenshin-navy/90 transition-colors"
      >
        {t("viewData")}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {snapshot.versionNumber && (
                <span className="font-mono font-bold text-gray-900">
                  #{snapshot.versionNumber}
                </span>
              )}
              <span>{t("snapshotDetails")}</span>
            </DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">{t("loadingData")}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
              <p className="text-sm font-medium">{t("error")}</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          )}

          {detailData && !isLoading && !error && (
            <div className="space-y-4">
              {/* メタデータセクション */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium">{t("fetchedAt")}</p>
                  <p className="text-lg font-bold text-gray-800">
                    {currentLocale === "ja"
                      ? format(new Date(snapshot.created_at), "yyyy/MM/dd HH:mm", { locale: dateLocale })
                      : format(new Date(snapshot.created_at), "MMM dd, yyyy HH:mm", { locale: dateLocale })}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium">{t("fetchMethod")}</p>
                  <Badge
                    variant="outline"
                    className={
                      snapshot.snapshot_type === "manual"
                        ? "border-gray-300 text-gray-600"
                        : "border-blue-300 text-blue-600"
                    }
                  >
                    {snapshot.snapshot_type === "manual" ? t("manual") : t("auto")}
                  </Badge>
                </div>

                {/* 統計情報 */}
                {stats && (
                  <div className="col-span-1 md:col-span-2 space-y-1 mt-2">
                    <p className="text-xs text-gray-500 font-medium">{t("chartSummary")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="bg-sky-100 text-sky-700 border-sky-200">
                        Visions: {stats.visions}
                      </Badge>
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                        Realities: {stats.realities}
                      </Badge>
                      <Badge variant="outline" className="bg-orange-100 text-orange-600 border-orange-200">
                        Tensions: {stats.tensions}
                      </Badge>
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                        Actions: {stats.actions}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* メモ（Description） */}
                {snapshot.description && (
                  <div className="col-span-1 md:col-span-2 space-y-1 mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 font-medium">{t("memo")}</p>
                    <p className="text-sm text-gray-700 italic bg-white p-2 rounded border border-gray-200">
                      {snapshot.description}
                    </p>
                  </div>
                )}
              </div>

              {/* JSONデータ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{t("rawData")}</h3>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          JSON.stringify(detailData.data, null, 2)
                        );
                        toast.success(t("jsonCopied"));
                        setJsonCopied(true);
                        setTimeout(() => setJsonCopied(false), 2000);
                      } catch {
                        toast.error(t("copyFailed"));
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded px-2 py-1 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {jsonCopied ? t("jsonCopyDone") : t("jsonCopyLabel")}
                  </button>
                </div>
                <div className="rounded-md bg-muted p-4 overflow-auto max-h-[400px] w-full border border-gray-200">
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(detailData.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

