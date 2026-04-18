"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { format } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { Calendar, RefreshCcw, CheckCircle2, Link2, Check } from "lucide-react";
import { toast } from "sonner";
import { DeleteChartButton } from "@/components/charts/delete-chart-button";
import { getChartDisplayTitle } from "@/lib/chart-display";
import type { ChartWithMeta } from "@/lib/charts-actions";

export function ChartCard({ chart, isMaster = false, wsId }: { chart: ChartWithMeta; isMaster?: boolean; wsId?: string }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const dateLocale = locale === "ja" ? ja : enUS;
  const chartHref = wsId ? `/workspaces/${wsId}/charts/${chart.id}` : `/charts/${chart.id}`;
  const handleCopyLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${chartHref}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t("linkCopied"), { duration: 2000 });
    });
  };
  const depthLabel =
    chart.depth === 1
      ? t("master")
      : chart.depth === 2
        ? t("second")
        : chart.depth === 3
          ? t("third")
          : t("nth", { n: chart.depth });

  const actionStatus = chart.actionStatusCounts ?? {
    total: 0,
    done: 0,
    inProgress: 0,
    onHold: 0,
    notStarted: 0,
    cancelled: 0,
  };

  const bgClass = isMaster
    ? "bg-zenshin-cream/60 border-zenshin-navy/12 hover:bg-white"
    : "bg-zenshin-cream/50 border-zenshin-navy/6 hover:bg-white";

  return (
    <div className={`group relative rounded-xl border p-4 h-full hover:shadow-md hover:border-zenshin-orange/30 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col ${bgClass}`}>
      <Link href={chartHref} className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <DepthBadge depth={chart.depth} label={depthLabel} />
            <StatusBar status={actionStatus} />
          </div>
          {/* ゴミ箱ボタン用のスペーサー（レイアウト維持） */}
          <div className="w-8 h-8 shrink-0 ml-2" />
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h4 className={`font-bold text-zenshin-navy leading-snug line-clamp-2 group-hover:text-zenshin-orange transition-colors flex-1 min-w-0 ${isMaster ? "text-base" : "text-sm"}`}>
            {getChartDisplayTitle(chart, tc)}
          </h4>
          {chart.status === "completed" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              {t("completed")}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-zenshin-navy/5">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zenshin-navy/70">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {chart.due_date ? (
                <span>{t("dueDate")}: {format(new Date(chart.due_date), "MM/dd", { locale: dateLocale })}</span>
              ) : (
                <span className="text-zenshin-orange/60">{t("dueNotSet")}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <RefreshCcw className="w-3 h-3" />
              <span>{t("updated")}: {format(new Date(chart.updated_at), "MM/dd", { locale: dateLocale })}</span>
            </div>
          </div>
          {chart.assignees && chart.assignees.length > 0 ? (
            <div className="flex -space-x-1.5 shrink-0">
              {chart.assignees.slice(0, 4).map((assignee) => (
                <div
                  key={assignee.id}
                  className="w-5 h-5 rounded-full border-2 border-white overflow-hidden bg-zenshin-navy/10 flex items-center justify-center"
                  title={assignee.name || assignee.email}
                >
                  {assignee.avatar_url ? (
                    <img
                      src={assignee.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] font-medium text-zenshin-navy/70">
                      {(assignee.name || assignee.email || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Link>

      {/* Link の外に配置。hover で表示、クリックしても遷移しない */}
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          onClick={handleCopyLink}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-zenshin-navy/10 transition-colors"
          title={copied ? t("linkCopied") : t("copyLink")}
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4 text-zenshin-navy/50" />}
        </button>
        <DeleteChartButton chartId={chart.id} />
      </div>
    </div>
  );
}

function StatusBar({ status }: { status: { total: number; done: number; inProgress: number; onHold: number; notStarted: number; cancelled: number } }) {
  const { total, done, inProgress, onHold, notStarted, cancelled } = status;
  if (total === 0) return null;

  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-zenshin-navy/5 max-w-[80px]">
        {done > 0 && <div className="bg-emerald-400" style={{ width: pct(done) }} />}
        {inProgress > 0 && <div className="bg-blue-400" style={{ width: pct(inProgress) }} />}
        {onHold > 0 && <div className="bg-amber-400" style={{ width: pct(onHold) }} />}
        {cancelled > 0 && <div className="bg-red-300" style={{ width: pct(cancelled) }} />}
        {notStarted > 0 && <div className="bg-zenshin-navy/10" style={{ width: pct(notStarted) }} />}
      </div>
      <span className="text-[10px] text-zenshin-navy/40 whitespace-nowrap">
        {done}/{total}
      </span>
    </div>
  );
}

function DepthBadge({ depth, label }: { depth: number; label: string }) {
  const colorClass =
    depth === 1
      ? "bg-zenshin-navy text-white"
      : depth === 2
        ? "bg-zenshin-teal/15 text-zenshin-teal"
        : "bg-zenshin-orange/15 text-zenshin-orange";

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${colorClass}`}>
      {label}
    </span>
  );
}
