"use client";

import { useTranslations } from "next-intl";
import { Rocket, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MomentumData } from "./actions";

type MomentumScoreCardProps = {
  data: MomentumData;
};

export function MomentumScoreCard({ data }: MomentumScoreCardProps) {
  const t = useTranslations("dashboard");

  const trendUp = data.diff !== null && data.diff > 0;
  const trendDown = data.diff !== null && data.diff < 0;
  const trendFlat = data.diff !== null && data.diff === 0;

  const summaryItems = [
    ...data.details.plusFactors.slice(0, 2).map((f) => ({ label: f.label, value: f.value, positive: true })),
    ...data.details.minusFactors.slice(0, 2).map((f) => ({ label: f.label, value: f.value, positive: false })),
  ].slice(0, 3);

  return (
    <div className="bg-white rounded-xl border border-zenshin-navy/8 shadow-sm overflow-hidden">
      {/* 前進スコアカード */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="w-5 h-5 text-emerald-500" />
          <h2 className="text-sm font-medium text-zenshin-navy/70">{t("momentumScore")}</h2>
        </div>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-4xl font-bold text-zenshin-navy">{data.scoreDisplay}</span>
          <span className="text-sm text-zenshin-navy/50">/ 100</span>
        </div>
        <div className="w-full bg-zenshin-navy/8 rounded-full h-2.5 mb-4">
          <div
            className="h-2.5 rounded-full transition-all bg-gradient-to-r from-emerald-400 to-emerald-600"
            style={{ width: `${data.scoreDisplay}%` }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zenshin-navy/50">{t("weekOverWeek")}:</span>
          {data.diff !== null ? (
            <span
              className={`flex items-center gap-1 font-medium ${
                trendUp ? "text-emerald-600" : trendDown ? "text-red-600" : "text-zenshin-navy/60"
              }`}
            >
              {trendUp && <TrendingUp className="w-4 h-4" />}
              {trendDown && <TrendingDown className="w-4 h-4" />}
              {trendFlat && <Minus className="w-4 h-4" />}
              {data.diff > 0 ? `+${data.diff}` : data.diff}
              {trendUp && t("trendUp")}
              {trendDown && t("trendDown")}
              {trendFlat && t("trendFlat")}
            </span>
          ) : (
            <span className="text-zenshin-navy/40">{t("noPrevWeek")}</span>
          )}
        </div>
        {summaryItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zenshin-navy/8">
            <p className="text-xs text-zenshin-navy/50 mb-2">{t("scoreSummary")}</p>
            <ul className="space-y-1">
              {summaryItems.map((item, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      item.positive ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span className={item.positive ? "text-emerald-700" : "text-amber-700"}>
                    {item.label}: {item.value > 0 ? `+${item.value}` : item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* AIインサイト */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🤖</span>
          <h3 className="text-sm font-medium text-zenshin-navy/70">{t("aiInsight")}</h3>
          <span className="text-xs text-zenshin-navy/40">({t("mondayUpdate")})</span>
        </div>
        {data.aiInsight ? (
          <p className="text-sm text-zenshin-navy/80 italic leading-relaxed">{data.aiInsight}</p>
        ) : (
          <p className="text-sm text-zenshin-navy/40 italic">{t("aiInsightPlaceholder")}</p>
        )}
      </div>
    </div>
  );
}
