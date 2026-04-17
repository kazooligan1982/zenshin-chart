"use client";

import React, { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Check, ChevronDown, Loader2, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { ChartTreeNode } from "./actions";

type ContextBarProps = {
  chartTree: ChartTreeNode[];
  selectedChartId: string;
  period: string;
  from: string | null;
  to: string | null;
};

const PERIOD_SEGMENTS = [
  { value: "this_week", label: "1W" },
  { value: "this_month", label: "1M" },
  { value: "this_quarter", label: "1Q" },
  { value: "all", label: "ALL" },
] as const;

function formatDateShort(dateStr: string): string {
  return format(new Date(dateStr), "M/d", { locale: ja });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _formatDateRange(fromStr: string, toStr: string): string {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromFmt = sameYear
    ? format(from, "M/d", { locale: ja })
    : format(from, "yyyy/M/d", { locale: ja });
  const toFmt = sameYear
    ? format(to, "M/d", { locale: ja })
    : format(to, "yyyy/M/d", { locale: ja });
  return `${fromFmt} – ${toFmt}`;
}

function DepthBadge({ depth, t }: { depth: number; t: (key: string) => string }) {
  switch (depth) {
    case 0:
      return (
        <span className="bg-zenshin-navy text-white text-[10px] px-1.5 py-0.5 rounded shrink-0">
          {t("master")}
        </span>
      );
    case 1:
      return (
        <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded shrink-0">
          {t("secondChart")}
        </span>
      );
    case 2:
      return (
        <span className="bg-sky-100 text-sky-700 text-[10px] px-1.5 py-0.5 rounded shrink-0">
          {t("thirdChart")}
        </span>
      );
    default:
      return (
        <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded shrink-0">
          {depth + 1}th
        </span>
      );
  }
}

export function DashboardContextBar({
  chartTree,
  selectedChartId,
  period,
  from,
  to,
}: ContextBarProps) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [chartOpen, setChartOpen] = React.useState(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const selectedChart = chartTree.find((c) => c.id === selectedChartId);
  const selectedLabel = selectedChart ? selectedChart.title : t("allCharts");

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      router.push(newUrl, { scroll: false });
    });
  };

  const handleChartSelect = (chartId: string) => {
    setChartOpen(false);
    updateSearchParams({
      chartId: chartId === "all" ? null : chartId,
    });
  };

  const handlePeriodSelect = (value: string) => {
    setCalendarOpen(false);
    if (value === "all") {
      updateSearchParams({ period: null, from: null, to: null });
    } else {
      updateSearchParams({ period: value, from: null, to: null });
    }
  };

  const handleCalendarOpenChange = (open: boolean) => {
    setCalendarOpen(open);
    if (open && period !== "custom") {
      updateSearchParams({ period: "custom", from: null, to: null });
    }
  };

  const handleClearCustom = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCalendarOpen(false);
    updateSearchParams({ period: null, from: null, to: null });
  };

  const isCustom = period === "custom";
  const hasCustomDates = isCustom && from && to;
  const activePeriod = isCustom ? "custom" : period || "all";

  const dateRange: DateRange | undefined =
    from && to
      ? { from: new Date(from), to: new Date(to) }
      : from
        ? { from: new Date(from), to: undefined }
        : undefined;

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range) {
      updateSearchParams({ from: null, to: null });
      return;
    }
    const fromStr = range.from ? format(range.from, "yyyy-MM-dd") : null;
    const toStr = range.to ? format(range.to, "yyyy-MM-dd") : null;
    updateSearchParams({ from: fromStr, to: toStr });
    if (range.from && range.to) {
      setCalendarOpen(false);
    }
  };

  return (
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-zenshin-navy/8 px-6 lg:px-10 py-3 -mx-6 lg:-mx-10 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        {/* 左: チャート選択ドロップダウン */}
        <div className={cn("transition-opacity", isPending && "opacity-70 pointer-events-none")}>
          <Popover open={chartOpen} onOpenChange={setChartOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 h-9 px-3 rounded-lg border border-zenshin-navy/15 bg-white hover:bg-zenshin-navy/5 transition-colors text-sm min-w-[280px] max-w-[400px]"
              >
                <span className="text-sm shrink-0">📊</span>
                <span className="truncate text-zenshin-navy font-medium">
                  {selectedLabel}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-zenshin-navy/40 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="min-w-[360px] max-w-[500px] w-auto p-0" align="start">
              <div className="max-h-[320px] overflow-y-auto py-1">
                <button
                  type="button"
                  onClick={() => handleChartSelect("all")}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-zenshin-navy/5 transition-colors",
                    selectedChartId === "all" && "bg-zenshin-navy/5"
                  )}
                >
                  {selectedChartId === "all" ? (
                    <Check className="w-3.5 h-3.5 text-zenshin-navy shrink-0" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="font-medium text-zenshin-navy">
                    {t("allCharts")}
                  </span>
                </button>

                <div className="h-px bg-zenshin-navy/8 mx-2 my-1" />

                {chartTree.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleChartSelect(node.id)}
                    className={cn(
                      "flex items-start gap-2 w-full py-2 pr-3 text-sm text-left hover:bg-zenshin-navy/5 transition-colors",
                      node.depth === 0 && "pl-3",
                      node.depth === 1 && "pl-6",
                      node.depth >= 2 && "pl-10",
                      selectedChartId === node.id && "bg-zenshin-navy/5"
                    )}
                  >
                    {selectedChartId === node.id ? (
                      <Check className="w-3.5 h-3.5 text-zenshin-navy shrink-0 mt-0.5" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <DepthBadge depth={node.depth} t={t} />
                    <span
                      className={cn(
                        "min-w-0 line-clamp-2 leading-snug text-left",
                        node.depth === 0
                          ? "font-semibold text-zenshin-navy"
                          : "text-zenshin-navy/80"
                      )}
                    >
                      {node.title}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 縦区切り線 */}
        <div className="h-6 w-px bg-zenshin-navy/15 hidden sm:block" />

        {/* 右: 期間セグメントボタン */}
        <div className="flex items-center gap-1 rounded-lg bg-zenshin-navy/5 p-1">
          {PERIOD_SEGMENTS.map((seg) => (
            <button
              key={seg.value}
              type="button"
              disabled={isPending}
              onClick={() => handlePeriodSelect(seg.value)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-70",
                activePeriod === seg.value
                  ? "bg-white text-zenshin-navy shadow-sm"
                  : "text-zenshin-navy/50 hover:text-zenshin-navy/70"
              )}
            >
              {seg.label}
            </button>
          ))}

          {/* カスタム期間ボタン + カレンダー Popover */}
          <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  isCustom
                    ? "bg-white text-zenshin-navy shadow-sm"
                    : "text-zenshin-navy/50 hover:text-zenshin-navy/70"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                {hasCustomDates ? (
                  <>
                    <span className="text-sm font-medium">{formatDateShort(from)} - {formatDateShort(to)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleClearCustom}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleClearCustom(e as unknown as React.MouseEvent);
                        }
                      }}
                      className="ml-1 text-zenshin-navy/40 hover:text-zenshin-navy/70 transition-colors"
                      aria-label={t("resetToAll")}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </>
                ) : (
                  <span>{t("customPeriod")}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="px-3 pt-3 pb-1 text-sm text-zenshin-navy/60">
                {from && to ? (
                  `${formatDateShort(from)} → ${formatDateShort(to)}`
                ) : from ? (
                  `${formatDateShort(from)} → ${t("selectEndDate")}`
                ) : (
                  t("selectStartDate")
                )}
              </div>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleRangeSelect}
                numberOfMonths={1}
                defaultMonth={dateRange?.from ?? new Date()}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* ローディングスピナー */}
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-zenshin-navy/50 shrink-0" />
        )}
      </div>
    </div>
  );
}
