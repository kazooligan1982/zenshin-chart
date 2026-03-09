"use client";

import { useTranslations } from "next-intl";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import type { MomentumTrendPoint } from "./actions";

type MomentumTrendChartProps = {
  data: MomentumTrendPoint[];
};

export function MomentumTrendChart({ data }: MomentumTrendChartProps) {
  const t = useTranslations("dashboard");

  if (data.length < 2) {
    return (
      <div className="bg-white rounded-xl border border-zenshin-navy/8 shadow-sm p-6 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📈</span>
          <h2 className="text-sm font-medium text-zenshin-navy/70">{t("momentumTrend")}</h2>
        </div>
        <p className="text-sm text-zenshin-navy/40 italic py-12 text-center flex-1 flex items-center justify-center">
          {t("momentumTrendPlaceholder")}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-zenshin-navy/8 shadow-sm p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📈</span>
        <h2 className="text-sm font-medium text-zenshin-navy/70">{t("momentumTrend")}</h2>
      </div>
      <div className="min-h-[180px] flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="momentumGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              labelStyle={{ color: "#334155", fontWeight: 500 }}
              formatter={(value: number | undefined) => [value ?? 0, t("momentumScore")] as [number, string]}
              labelFormatter={(label) => label}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#momentumGradient)"
              dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: "#10b981", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
