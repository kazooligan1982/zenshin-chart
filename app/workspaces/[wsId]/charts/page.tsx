export const dynamic = "force-dynamic";
import { getTranslations } from "next-intl/server";
import {
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { NewChartButton } from "@/components/charts/new-chart-button";
import { ChartCard } from "@/components/charts/chart-card";
import { CompletedChartsSection } from "@/components/charts/completed-charts-section";
import { getChartsHierarchy, type ProjectGroup } from "@/lib/charts-actions";
import { createClient } from "@/lib/supabase/server";
import { canCreateChart } from "@/lib/permissions";

export default async function WorkspaceChartsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  const role = (membership?.role ?? "viewer") as "owner" | "consultant" | "editor" | "viewer";
  const showNewChartButton = canCreateChart(role);

  const { projectGroups, recentCharts, completedCharts } = await getChartsHierarchy(wsId);
  const t = await getTranslations("home");

  return (
    <div className="min-h-screen bg-zenshin-cream">
      <div className="max-w-7xl mx-auto py-10 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-extrabold text-zenshin-navy tracking-tight">
              {t("title")}
            </h1>
            <p className="text-sm text-zenshin-navy/60 mt-1">
              {t("subtitle")}
            </p>
          </div>
          {showNewChartButton && <NewChartButton workspaceId={wsId} />}
        </div>

        {/* Recent Activity */}
        {recentCharts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-4 h-4 text-zenshin-orange" />
              <h2 className="text-sm font-bold text-zenshin-navy/70 uppercase tracking-wider">
                {t("recentActivity")}
              </h2>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4 snap-x scrollbar-hide">
              {recentCharts.map((chart) => (
                <div key={chart.id} className="snap-start shrink-0 w-[280px]">
                  <ChartCard chart={chart} wsId={wsId} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All Charts */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <FolderOpen className="w-4 h-4 text-zenshin-teal" />
            <h2 className="text-sm font-bold text-zenshin-navy/70 uppercase tracking-wider">
              {t("allCharts")}
            </h2>
          </div>

          {projectGroups.length === 0 ? (
            <div className="text-center py-20 rounded-2xl bg-white/60 border border-zenshin-navy/10">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-zenshin-navy/20" />
              <p className="text-lg font-semibold text-zenshin-navy/60">
                {t("noCharts")}
              </p>
              <p className="text-sm mt-2 text-zenshin-navy/40">
                {showNewChartButton
                  ? t("noChartsHint")
                  : t("noChartsHintViewer")}
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {projectGroups.map((group) => (
                <ProjectGroupSection key={group.master.id} group={group} wsId={wsId} t={t} />
              ))}
            </div>
          )}

          {/* 完了済みチャート */}
          {completedCharts.length > 0 && (
            <CompletedChartsSection completedCharts={completedCharts} wsId={wsId} />
          )}
        </section>
      </div>
    </div>
  );
}

function ProjectGroupSection({ group, wsId, t }: { group: ProjectGroup; wsId: string; t: (key: string, values?: Record<string, string | number>) => string }) {
  const { master, layers } = group;
  const layerDepths = Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="bg-white rounded-2xl border border-zenshin-navy/8 shadow-sm overflow-hidden p-5">
      {/* Master Chart - same card style */}
      <div className="mb-4">
        <ChartCard chart={master} isMaster wsId={wsId} />
      </div>

      {/* Sub Charts */}
      {layerDepths.length > 0 ? (
        layerDepths.map((depth) => (
          <div key={depth}>
            <div className="flex items-center gap-3 mb-3 mt-4">
              <div className="h-px bg-zenshin-navy/10 flex-1" />
              <span className="text-[10px] font-bold text-zenshin-navy/40 uppercase tracking-widest">
                {depth === 2
                  ? t("secondCharts")
                  : depth === 3
                    ? t("thirdCharts")
                    : t("nthCharts", { n: depth })}
              </span>
              <div className="h-px bg-zenshin-navy/10 flex-1" />
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 snap-x [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:opacity-0 [&:hover::-webkit-scrollbar]:opacity-100 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zenshin-navy/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-zenshin-navy/25">
              {layers[depth].map((chart) => (
                <div key={chart.id} className="snap-start shrink-0 w-[260px]">
                  <ChartCard chart={chart} wsId={wsId} />
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-zenshin-navy/30 italic py-2">
          {t("noSubCharts")}
        </p>
      )}
    </div>
  );
}
