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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Copy,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Calendar,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { logger } from "@/lib/logger";

interface Snapshot {
  id: string;
  created_at: string;
  snapshot_type: string;
  scope?: string;
  trigger_type?: string;
  description?: string | null;
  versionNumber?: string;
}

interface SnapshotViewerProps {
  snapshot: Snapshot;
  autoOpen?: boolean;
}

interface SnapshotItem {
  id?: string;
  content?: string;
  title?: string;
  [key: string]: unknown;
}

interface SnapshotDetail {
  id: string;
  chart_id: string;
  created_at: string;
  snapshot_type: string;
  scope?: string;
  trigger_type?: string;
  description?: string | null;
  data: {
    tree_meta?: {
      master_chart_id: string;
      captured_at: string;
      total_charts: number;
    };
    summary?: {
      total_visions: number;
      total_realities: number;
      total_tensions: number;
      total_actions: number;
      per_chart?: Array<{
        chart_id: string;
        title: string;
        v: number;
        r: number;
        t: number;
        a: number;
      }>;
    };
    charts?: Array<{
      chart_id: string;
      title: string;
      depth: number;
      role: string;
      visions?: SnapshotItem[];
      realities?: SnapshotItem[];
      tensions?: SnapshotItem[];
      actions?: SnapshotItem[];
    }>;
    visions?: SnapshotItem[];
    realities?: SnapshotItem[];
    tensions?: SnapshotItem[];
    tension_visions?: SnapshotItem[];
    tension_realities?: SnapshotItem[];
    actions?: SnapshotItem[];
  };
}

function getDepthBadgeLabel(depth: number, t: (key: string) => string) {
  if (depth === 1) return t("masterChart");
  if (depth === 2) return "2nd";
  if (depth === 3) return "3rd";
  return `${depth}th`;
}

function getDepthBadgeClass(depth: number) {
  if (depth === 1) return "bg-slate-900 text-white";
  if (depth === 2) return "bg-teal-600 text-white";
  if (depth === 3) return "bg-orange-500 text-white";
  return "bg-gray-500 text-white";
}

function TreeSnapshotModalContent({
  detailData,
  t,
  currentLocale,
  dateLocale,
  jsonCopied,
  setJsonCopied,
}: {
  detailData: SnapshotDetail;
  t: (key: string) => string;
  currentLocale: string;
  dateLocale: Locale;
  jsonCopied: boolean;
  setJsonCopied: (v: boolean) => void;
}) {
  const [viewTab, setViewTab] = useState<"summary" | "full">("summary");
  const [expandedChartId, setExpandedChartId] = useState<string | null>(null);
  const data = detailData.data;
  const treeMeta = data?.tree_meta;
  const summary = data?.summary;
  const charts = data?.charts ?? [];
  const chartDepthMap = new Map<string, number>();
  charts.forEach((c) => chartDepthMap.set(c.chart_id, c.depth));

  const masterChart = charts.find((c) => c.role === "master");
  const masterTitle = masterChart?.title ?? treeMeta?.master_chart_id ?? "-";

  const perChart = summary?.per_chart ?? [];

  return (
    <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as "summary" | "full")} className="overflow-x-hidden">
      <TabsList className="grid w-auto grid-cols-2 mb-4">
        <TabsTrigger value="summary" className="flex items-center gap-2">
          📊 {t("summaryTab")}
        </TabsTrigger>
        <TabsTrigger value="full" className="flex items-center gap-2">
          📋 {t("fullDataTab")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="space-y-4">
        {/* ツリー情報ヘッダー */}
        {treeMeta && (
          <div className="p-5 bg-purple-50 rounded-xl border border-purple-100">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-purple-900">
                🌳 {t("treeSnapshotTitle")}
              </h3>
              <div className="relative inline-flex items-center group">
                <HelpCircle className="w-4 h-4 text-slate-400 cursor-help shrink-0" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-white text-xs rounded-lg p-3 max-w-xs w-72 shadow-lg z-50 pointer-events-none">
                  {t("treeSnapshotHelp")}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-white/60 border border-purple-100/60 p-3 mb-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                {t("masterChartName")}
              </p>
              <p className="text-base font-semibold text-slate-800 mt-1 break-words">
                {masterTitle}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500 mt-3">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {currentLocale === "ja"
                  ? format(new Date(treeMeta.captured_at), "yyyy/MM/dd HH:mm", { locale: dateLocale })
                  : format(new Date(treeMeta.captured_at), "MMM dd, yyyy HH:mm", { locale: dateLocale })}
              </span>
              <span className="text-slate-300">・</span>
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                {treeMeta.total_charts} {t("charts")}
              </span>
            </div>
          </div>
        )}

        {/* チャート別サマリーテーブル */}
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-slate-200 bg-gray-50">
                <th
                  className="text-left py-2 px-3 text-sm font-medium text-slate-600"
                  style={{ width: "55%" }}
                >
                  {t("chartOverview")}
                </th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-emerald-600 w-16">
                  V
                </th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-orange-500 w-16">
                  R
                </th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-sky-600 w-16">
                  T
                </th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-slate-600 w-16 pr-4">
                  A
                </th>
              </tr>
            </thead>
            <tbody>
              {perChart.map((row) => {
                const depth = chartDepthMap.get(row.chart_id) ?? 1;
                const isExpanded = expandedChartId === row.chart_id;
                return (
                  <tr
                    key={row.chart_id}
                    className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                    onClick={() =>
                      setExpandedChartId(isExpanded ? null : row.chart_id)
                    }
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-start gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                        )}
                        <div className="w-20 flex-shrink-0">
                          <Badge
                            className={`text-[10px] px-2 py-0.5 rounded-full inline-block text-center min-w-[72px] w-full ${getDepthBadgeClass(depth)}`}
                          >
                            {getDepthBadgeLabel(depth, t)}
                          </Badge>
                        </div>
                        <span className="text-sm text-slate-800 break-words">
                          {row.title || t("noTitle")}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-3 text-sm text-emerald-600 tabular-nums">
                      {row.v}
                    </td>
                    <td className="text-right py-3 px-3 text-sm text-orange-500 tabular-nums">
                      {row.r}
                    </td>
                    <td className="text-right py-3 px-3 text-sm text-sky-600 tabular-nums">
                      {row.t}
                    </td>
                    <td className="text-right py-3 px-3 text-sm text-slate-600 tabular-nums pr-4">
                      {row.a}
                    </td>
                  </tr>
                );
              })}
              {summary && (
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="py-2 px-3 font-bold text-sm text-slate-700">
                    {t("total")}
                  </td>
                  <td className="text-right py-2 px-3 font-bold text-sm text-emerald-700 tabular-nums">
                    {summary.total_visions}
                  </td>
                  <td className="text-right py-2 px-3 font-bold text-sm text-orange-600 tabular-nums">
                    {summary.total_realities}
                  </td>
                  <td className="text-right py-2 px-3 font-bold text-sm text-sky-700 tabular-nums">
                    {summary.total_tensions}
                  </td>
                  <td className="text-right py-2 px-3 font-bold text-sm text-slate-700 tabular-nums pr-4">
                    {summary.total_actions}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 展開時のVRTA詳細 */}
        {expandedChartId && (() => {
          const chartData = charts.find((c) => c.chart_id === expandedChartId);
          if (!chartData) return null;
          const items = [
            { label: t("visions"), arr: chartData.visions ?? [], color: "text-emerald-600" },
            { label: t("realities"), arr: chartData.realities ?? [], color: "text-orange-500" },
            { label: t("tensions"), arr: chartData.tensions ?? [], color: "text-sky-600" },
            { label: t("actions"), arr: chartData.actions ?? [], color: "text-slate-600" },
          ];
          return (
            <div className="w-full p-4 pl-5 bg-gray-50 rounded-lg border space-y-3 overflow-x-hidden">
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-sm break-words flex-1 min-w-0">
                  {chartData.title || t("noTitle")}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        JSON.stringify(chartData, null, 2)
                      );
                      toast.success(
                        (t as (k: string, v?: Record<string, string>) => string)(
                          "copyChartJsonSuccess",
                          { chartName: chartData.title || t("noTitle") }
                        )
                      );
                    } catch {
                      toast.error(t("copyFailed"));
                    }
                  }}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                  title={t("copyChartJson")}
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {items.map(({ label, arr, color }) => (
                <div key={label} className="min-w-0">
                  <p className={`text-xs font-medium mb-1 ${color}`}>{label}</p>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {arr.map((item: SnapshotItem, i: number) => (
                      <li key={i} className="break-words whitespace-pre-wrap">
                        {item.content ?? item.title ?? t("noTitle")}
                      </li>
                    ))}
                    {arr.length === 0 && (
                      <li className="text-slate-400 italic text-sm">{t("none")}</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()}
      </TabsContent>

      <TabsContent value="full">
        <div className="space-y-2 overflow-x-hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{t("rawData")}</h3>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(detailData.data, null, 2)
                  );
                  toast.success(t("copyAllJsonSuccess"));
                  setJsonCopied(true);
                  setTimeout(() => setJsonCopied(false), 2000);
                } catch {
                  toast.error(t("copyFailed"));
                }
              }}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded px-2 py-1 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {jsonCopied ? t("jsonCopyDone") : t("copyAllJson")}
            </button>
          </div>
          <div className="rounded-md bg-muted p-4 overflow-auto max-h-[50vh] w-full border border-gray-200">
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(detailData.data, null, 2)}
            </pre>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

type Locale = typeof ja | typeof enUS;

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
        logger.error("[SnapshotViewer] Error fetching detail:", error);
        setError(error.message);
        return;
      }

      setDetailData(data as SnapshotDetail);
    } catch (err) {
      logger.error("[SnapshotViewer] Error fetching detail:", err);
      setError(err instanceof Error ? err.message : t("fetchDataFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoOpen) {
      handleOpen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleClose = () => {
    setIsOpen(false);
    setDetailData(null);
    setError(null);
  };

  const getStats = () => {
    if (!detailData?.data) return null;
    const d = detailData.data;
    if (detailData.scope === "tree" && d.summary) {
      return {
        visions: d.summary.total_visions ?? 0,
        realities: d.summary.total_realities ?? 0,
        tensions: d.summary.total_tensions ?? 0,
        actions: d.summary.total_actions ?? 0,
      };
    }
    const { visions, realities, tensions, actions } = d;
    return {
      visions: visions?.length || 0,
      realities: realities?.length || 0,
      tensions: tensions?.length || 0,
      actions: actions?.length || 0,
    };
  };

  const stats = getStats();
  const isTreeSnapshot = detailData?.scope === "tree";

  return (
    <>
      <Button
        onClick={handleOpen}
        className="text-xs bg-zenshin-navy text-white px-3 py-1.5 rounded-lg hover:bg-zenshin-navy/90 transition-colors"
      >
        {t("viewData")}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-full sm:max-w-5xl mx-auto max-h-[85vh] overflow-y-auto overflow-x-hidden">
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
            <div className="space-y-4 overflow-x-hidden p-6">
              {isTreeSnapshot ? (
                <TreeSnapshotModalContent
                  detailData={detailData}
                  t={t}
                  currentLocale={currentLocale}
                  dateLocale={dateLocale}
                  jsonCopied={jsonCopied}
                  setJsonCopied={setJsonCopied}
                />
              ) : (
                <>
                  {/* メタデータセクション (single) */}
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
                          (detailData.trigger_type ?? snapshot.snapshot_type) === "auto_daily"
                            ? "border-blue-300 text-blue-600"
                            : "border-gray-300 text-gray-600"
                        }
                      >
                        {(detailData.trigger_type ?? snapshot.snapshot_type) === "auto_daily"
                          ? t("auto_daily")
                          : t("manual")}
                      </Badge>
                    </div>

                    {stats && (
                      <div className="col-span-1 md:col-span-2 space-y-1 mt-2">
                        <p className="text-xs text-gray-500 font-medium">{t("chartSummary")}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            Visions: {stats.visions}
                          </Badge>
                          <Badge variant="outline" className="bg-orange-100 text-orange-600 border-orange-200">
                            Realities: {stats.realities}
                          </Badge>
                          <Badge variant="outline" className="bg-sky-100 text-sky-700 border-sky-200">
                            Tensions: {stats.tensions}
                          </Badge>
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                            Actions: {stats.actions}
                          </Badge>
                        </div>
                      </div>
                    )}

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
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

