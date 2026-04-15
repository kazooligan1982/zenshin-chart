"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ChartWithMeta } from "@/lib/charts-actions";
import { ChartCard } from "@/components/charts/chart-card";

export function CompletedChartsSection({
  completedCharts,
  wsId,
}: {
  completedCharts: ChartWithMeta[];
  wsId?: string;
}) {
  const t = useTranslations("home");
  const [showCompletedCharts, setShowCompletedCharts] = useState(false);

  return (
    <div className="mt-8">
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-3"
        onClick={() => setShowCompletedCharts(!showCompletedCharts)}
      >
        {showCompletedCharts ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        {t("completedCharts", { count: completedCharts.length })}
      </button>
      {showCompletedCharts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
          {completedCharts.map((chart) => (
            <div key={chart.id} className="snap-start shrink-0 w-full">
              <ChartCard chart={chart} wsId={wsId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
