export const dynamic = "force-dynamic";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  FolderOpen,
  Target,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDashboardData, getMomentumData, getMomentumTrend, type CascadeNode } from "./actions";
import { DashboardContextBar } from "./dashboard-context-bar";
import { MomentumScoreCard } from "./momentum-score-card";
import { MomentumTrendChart } from "./momentum-trend-chart";
import { MomentumInsightCard } from "./momentum-insight-card";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams?: Promise<{ chartId?: string; period?: string; from?: string; to?: string }>;
}) {
  const { wsId } = await params;
  const resolvedParams = await searchParams;
  const selectedChartId = resolvedParams?.chartId ?? "all";
  const period = resolvedParams?.period ?? "all";
  const from = resolvedParams?.from ?? null;
  const to = resolvedParams?.to ?? null;
  const {
    stats,
    actionAlerts,
    chartHealthList,
    delayCascade,
    availableCharts: chartTree,
  } = await getDashboardData(wsId, selectedChartId, period, from, to);
  const momentumData = await getMomentumData(wsId, selectedChartId);
  const momentumTrend = await getMomentumTrend(wsId, selectedChartId);
  const t = await getTranslations("dashboard");
  const tKanban = await getTranslations("kanban");

  return (
    <div className="py-8 px-6 lg:px-10 min-h-screen">
      {/* ヘッダー */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-zenshin-navy">{t("title")}</h1>
        <p className="text-sm text-zenshin-navy/40 mt-1">{t("subtitle")}</p>
      </div>

      {/* コンテキストバー（sticky） */}
      <DashboardContextBar
        chartTree={chartTree}
        selectedChartId={selectedChartId}
        period={period}
        from={from}
        to={to}
      />

      {/* ファーストビュー: スコア + 推移グラフ 横並び */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* 左: スコアカード (2/5幅) */}
        <div className="lg:col-span-2 h-full">
          {momentumData && <MomentumScoreCard data={momentumData} />}
        </div>
        {/* 右: 推移グラフ (3/5幅) */}
        <div className="lg:col-span-3 h-full">
          <MomentumTrendChart data={momentumTrend} />
        </div>
      </div>

      {/* AIインサイトカード（横幅フル） */}
      <div className="mb-8">
        <MomentumInsightCard aiInsight={momentumData?.aiInsight ?? null} />
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zenshin-navy/50">{t("chartCount")}</span>
            <FolderOpen className="w-4 h-4 text-zenshin-navy/30" />
          </div>
          <div className="text-3xl font-bold text-zenshin-navy">{stats.totalCharts}</div>
        </div>

        <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zenshin-navy/50">{t("actionCount")}</span>
            <Target className="w-4 h-4 text-zenshin-teal/60" />
          </div>
          <div className="text-3xl font-bold text-zenshin-navy">{stats.totalActions}</div>
        </div>

        <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zenshin-navy/50">{t("completed")}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-emerald-600">{stats.completedActions}</div>
        </div>

        <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zenshin-navy/50">{t("completionRate")}</span>
            <TrendingUp className="w-4 h-4 text-zenshin-orange/60" />
          </div>
          <div className="text-3xl font-bold text-zenshin-navy">{stats.completionRate}%</div>
          <div className="w-full bg-zenshin-navy/8 rounded-full h-1.5 mt-3">
            <div
              className="bg-zenshin-teal h-1.5 rounded-full transition-all"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* ステータス分布 */}
      <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5 mb-8">
        <h2 className="text-sm font-medium text-zenshin-navy/50 mb-4">{t("statusDistribution")}</h2>
        <div className="flex gap-3 flex-wrap">
          <StatusBadge label={tKanban("todo")} count={stats.statusDistribution.todo} color="bg-zenshin-navy/8 text-zenshin-navy" />
          <StatusBadge label={tKanban("inProgress")} count={stats.statusDistribution.in_progress} color="bg-blue-50 text-blue-600" />
          <StatusBadge label={tKanban("done")} count={stats.statusDistribution.done} color="bg-emerald-50 text-emerald-600" />
          <StatusBadge label={tKanban("pending")} count={stats.statusDistribution.pending} color="bg-amber-50 text-amber-600" />
          <StatusBadge label={tKanban("canceled")} count={stats.statusDistribution.canceled} color="bg-zenshin-navy/5 text-zenshin-navy/40" />
        </div>
      </div>

      {/* 要注意アクション */}
      {actionAlerts.length > 0 && (
        <section className="bg-white rounded-xl border border-zenshin-navy/8 p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-medium text-zenshin-navy/50">{t("actionAlerts")}</h2>
            <span className="text-xs text-zenshin-navy/40 bg-zenshin-navy/5 px-2 py-0.5 rounded-full">
              {actionAlerts.length}
            </span>
          </div>
          <div className="space-y-1">
            {actionAlerts.map((alert) => (
              <Link
                key={alert.id}
                href={`/workspaces/${wsId}/charts/${alert.chartId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zenshin-cream/60 transition-colors group"
              >
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap",
                  alert.alertType === "blocker" && "text-red-700 bg-red-50",
                  alert.alertType === "overdue" && "text-red-600 bg-red-50",
                  alert.alertType === "approaching" && "text-orange-600 bg-orange-50",
                )}>
                  {alert.alertType === "blocker"
                    ? t("blockerBadge")
                    : alert.alertType === "overdue"
                      ? t("overdueBadge")
                      : t("approachingBadge")}
                </span>

                <span className="text-sm text-zenshin-navy truncate flex-1 min-w-0 group-hover:text-zenshin-navy/80">
                  {alert.title}
                </span>

                <span className="text-xs text-zenshin-navy/30 truncate max-w-[150px] hidden lg:block">
                  {alert.chartTitle}
                </span>

                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap",
                  alert.alertType === "blocker" && "text-red-600 bg-red-50",
                  alert.alertType === "overdue" && "text-red-600 bg-red-50",
                  alert.alertType === "approaching" && "text-amber-600 bg-amber-50",
                )}>
                  {alert.badgeText}
                </span>

                <ChevronRight className="w-3.5 h-3.5 text-zenshin-navy/20 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* チャートの健康状態 */}
      {chartHealthList.length > 0 && (
        <section className="bg-white rounded-xl border border-zenshin-navy/8 p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-4 h-4 text-zenshin-navy/40" />
            <h2 className="text-sm font-medium text-zenshin-navy/50">{t("chartHealth")}</h2>
          </div>
          <div className="space-y-1">
            {chartHealthList.map((chart) => (
              <Link
                key={chart.id}
                href={`/workspaces/${wsId}/charts/${chart.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zenshin-cream/60 transition-colors group"
              >
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  chart.status === "critical" && "bg-red-500",
                  chart.status === "warning" && "bg-amber-400",
                  chart.status === "healthy" && "bg-emerald-400",
                )} />

                <span className="text-sm text-zenshin-navy truncate flex-1 min-w-0 group-hover:text-zenshin-navy/80">
                  {chart.title}
                </span>

                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap",
                  chart.status === "critical" && "text-red-600 bg-red-50",
                  chart.status === "warning" && "text-amber-600 bg-amber-50",
                  chart.status === "healthy" && "text-emerald-600 bg-emerald-50",
                )}>
                  {chart.status === "healthy"
                    ? chart.daysSinceUpdate === 0
                      ? t("today")
                      : t("daysAgo", { count: chart.daysSinceUpdate })
                    : t("daysNoUpdate", { count: chart.daysSinceUpdate })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 遅延カスケード */}
      {delayCascade.length > 0 && (
        <section className="bg-white rounded-xl border border-zenshin-navy/8 p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-medium text-zenshin-navy/50">{t("delayCascade")}</h2>
          </div>
          <div className="space-y-4">
            {delayCascade.map((root) => (
              <CascadeTree key={root.action.id} node={root} depth={0} wsId={wsId} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CascadeTree({
  node,
  depth,
  wsId,
  t,
}: {
  node: CascadeNode;
  depth: number;
  wsId: string;
  t: (key: string) => string;
}) {
  return (
    <div
      className={
        depth > 0 ? "ml-6 border-l-2 border-zenshin-navy/10 pl-4 relative" : "relative"
      }
    >
      <Link
        href={`/workspaces/${wsId}/charts/${node.chart.id}`}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-zenshin-cream/60 transition-colors"
      >
        {node.isRoot ? (
          <span className="text-red-500 font-bold">❌</span>
        ) : (
          <span className="text-orange-400">⏸</span>
        )}
        <span
          className={
            node.isRoot ? "font-medium text-red-700" : "font-medium text-orange-700"
          }
        >
          {node.action.title}
        </span>
        {node.isRoot && node.action.daysOverdue != null && (
          <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
            {node.action.daysOverdue}
            {t("daysOverdueShort")}
          </span>
        )}
        {!node.isRoot && (
          <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
            {t("blocked")}
          </span>
        )}
        {node.assignee && (
          <span className="text-xs text-zenshin-navy/40 ml-auto">
            {node.assignee.name}
          </span>
        )}
      </Link>
      {node.children.map((child) => (
        <CascadeTree key={child.action.id} node={child} depth={depth + 1} wsId={wsId} t={t} />
      ))}
    </div>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className={`px-4 py-2 rounded-lg ${color}`}>
      <span className="font-bold text-lg">{count}</span>
      <span className="ml-2 text-sm">{label}</span>
    </div>
  );
}
