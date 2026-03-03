export const dynamic = "force-dynamic";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  FolderOpen,
  Target,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { getDashboardData, type CascadeNode } from "./actions";
import { DashboardChartFilter } from "./dashboard-chart-filter";
import { DashboardPeriodFilter } from "./dashboard-period-filter";

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
    staleCharts,
    upcomingDeadlines,
    delayImpacts,
    recommendations,
    delayCascade,
    availableCharts,
  } = await getDashboardData(wsId, selectedChartId, period, from, to);
  const t = await getTranslations("dashboard");
  const tKanban = await getTranslations("kanban");

  return (
    <div className="py-8 px-6 lg:px-10 min-h-screen">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zenshin-navy">{t("title")}</h1>
          <p className="text-sm text-zenshin-navy/40 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <DashboardPeriodFilter period={period} from={from} to={to} />
          <DashboardChartFilter
            charts={availableCharts}
            selectedChartId={selectedChartId}
          />
        </div>
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

      {/* 遅延カスケード */}
      {delayCascade.length > 0 && (
        <section className="bg-white rounded-xl border border-zenshin-navy/8 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-zenshin-navy">{t("delayCascade")}</h2>
          </div>
          <div className="space-y-4">
            {delayCascade.map((root) => (
              <CascadeTree key={root.action.id} node={root} depth={0} wsId={wsId} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* 推奨アクション */}
      {recommendations.length > 0 && (
        <section className="bg-white rounded-xl border border-zenshin-navy/8 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-zenshin-navy">{t("recommendations")}</h2>
          </div>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <Link
                key={`${rec.chartId}-${rec.actionId ?? index}`}
                href={`/workspaces/${wsId}/charts/${rec.chartId}`}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-zenshin-cream/60 transition-colors cursor-pointer"
              >
                <span className="text-lg shrink-0">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {rec.type === "critical_blocker" && (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        {t("highPriority")}
                      </span>
                    )}
                    {rec.type === "deadline_approaching" && (
                      <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                        {t("deadlineSoon")}
                      </span>
                    )}
                    {rec.type === "stale_chart" && (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {t("staleWarning")}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-zenshin-navy mt-1">{rec.title}</p>
                  <p className="text-sm text-zenshin-navy/50 mt-0.5">{rec.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zenshin-navy/30 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 停滞 & 期限切れ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 停滞しているチャート */}
        <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-medium text-zenshin-navy/50">{t("stalledCharts")}</h2>
          </div>
          {staleCharts.length === 0 ? (
            <p className="text-sm text-zenshin-navy/40 text-center py-6">
              {t("noStalledCharts")}
            </p>
          ) : (
            <div className="space-y-1">
              {staleCharts.map((chart) => (
                <Link
                  key={chart.id}
                  href={`/workspaces/${wsId}/charts/${chart.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zenshin-cream/60 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderOpen className="w-4 h-4 text-zenshin-navy/30 shrink-0" />
                    <span className="text-sm text-zenshin-navy truncate group-hover:text-zenshin-navy/80">{chart.title}</span>
                  </div>
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0 ml-3">
                    {t("daysAgo", { count: chart.daysSinceUpdate })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 期限切れ / 期限間近のアクション */}
        <div className="bg-white rounded-xl border border-zenshin-navy/8 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-medium text-zenshin-navy/50">{t("overdueActions")}</h2>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-zenshin-navy/40 text-center py-6">
              {t("noOverdueActions")}
            </p>
          ) : (
            <div className="space-y-1">
              {upcomingDeadlines.map((action) => (
                <Link
                  key={action.id}
                  href={`/workspaces/${wsId}/charts/${action.chart_id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zenshin-cream/60 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-zenshin-navy truncate block group-hover:text-zenshin-navy/80">{action.title}</span>
                    <span className="text-xs text-zenshin-navy/40 truncate block">{action.chart_title}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-3 flex items-center gap-1 ${
                    action.isOverdue
                      ? "text-red-600 bg-red-50"
                      : "text-amber-600 bg-amber-50"
                  }`}>
                    {action.isOverdue ? (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        {t("daysOverdue", { count: Math.abs(action.daysUntilDue) })}
                      </>
                    ) : action.daysUntilDue === 0 ? (
                      t("today")
                    ) : (
                      t("daysLeft", { count: action.daysUntilDue })
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
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
