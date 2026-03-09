"use client";

import { useTranslations } from "next-intl";

type MomentumInsightCardProps = {
  aiInsight: string | null;
};

export function MomentumInsightCard({ aiInsight }: MomentumInsightCardProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-xl border border-indigo-100/60 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🤖</span>
        <h2 className="text-sm font-medium text-zenshin-navy/70">{t("aiInsight")}</h2>
        <span className="text-xs text-zenshin-navy/40">({t("mondayUpdate")})</span>
      </div>

      {aiInsight ? (
        <div className="space-y-3">
          <p className="text-sm text-zenshin-navy/80 leading-relaxed">{aiInsight}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-indigo-100/60">
            <div className="flex items-start gap-2">
              <span className="text-sm shrink-0">💡</span>
              <div>
                <p className="text-xs font-medium text-zenshin-navy/60">{t("aiInsightFact")}</p>
                <p className="text-xs text-zenshin-navy/40 mt-0.5">—</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sm shrink-0">🔍</span>
              <div>
                <p className="text-xs font-medium text-zenshin-navy/60">{t("aiInsightWhy")}</p>
                <p className="text-xs text-zenshin-navy/40 mt-0.5">—</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sm shrink-0">⚡</span>
              <div>
                <p className="text-xs font-medium text-zenshin-navy/60">{t("aiInsightNext")}</p>
                <p className="text-xs text-zenshin-navy/40 mt-0.5">—</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zenshin-navy/40 italic">{t("aiInsightPlaceholder")}</p>
      )}
    </div>
  );
}
