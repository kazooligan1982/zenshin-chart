"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { getChartsHierarchy, type ProjectGroup } from "@/app/charts/actions";
import { ChevronDown, BarChart3, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

interface ChartSwitcherProps {
  currentChartTitle: string;
  subPage: string;
}

const depthConfig: Record<number, { en: string; ja: string; colorClass: string }> = {
  1: { en: "Master", ja: "Master", colorClass: "bg-zenshin-navy text-white" },
  2: { en: "2nd", ja: "2nd", colorClass: "bg-zenshin-teal/15 text-zenshin-teal" },
  3: { en: "3rd", ja: "3rd", colorClass: "bg-zenshin-orange/15 text-zenshin-orange" },
};

function DepthBadge({ depth }: { depth: number }) {
  const config = depthConfig[depth] || { en: `${depth}th`, ja: `${depth}th`, colorClass: "bg-gray-100 text-gray-600" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${config.colorClass}`}>
      {config.en}
    </span>
  );
}

export function ChartSwitcher({ currentChartTitle, subPage }: ChartSwitcherProps) {
  const params = useParams();
  const wsId = params?.wsId as string | undefined;
  const currentChartId = params?.id as string;
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [snapshotCounts, setSnapshotCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getChartsHierarchy(wsId);
        setProjectGroups(data.projectGroups);

        // 全チャートIDを収集してスナップショット件数を取得
        const allChartIds: string[] = [];
        data.projectGroups.forEach((g) => {
          allChartIds.push(g.master.id);
          Object.values(g.layers).forEach((charts) => {
            charts.forEach((c) => allChartIds.push(c.id));
          });
        });

        if (allChartIds.length > 0) {
          const { data: snapshots } = await supabase
            .from("snapshots")
            .select("chart_id")
            .in("chart_id", allChartIds);
          if (snapshots) {
            const counts: Record<string, number> = {};
            snapshots.forEach((s: any) => {
              counts[s.chart_id] = (counts[s.chart_id] || 0) + 1;
            });
            setSnapshotCounts(counts);
          }
        }
      } catch (e) {
        console.error("[ChartSwitcher] Failed to fetch data:", e);
      }
    };
    fetchData();
  }, [wsId]);

  const buildHref = (chartId: string) => {
    if (wsId) return `/workspaces/${wsId}/charts/${chartId}/${subPage}`;
    return `/charts/${chartId}/${subPage}`;
  };

  const editorHref = wsId
    ? `/workspaces/${wsId}/charts/${currentChartId}`
    : `/charts/${currentChartId}`;

  return (
    <div className="flex items-center gap-3 mt-2 flex-wrap">
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zenshin-navy/5 text-sm text-zenshin-navy border border-zenshin-navy/10 hover:bg-zenshin-navy/10 transition-colors cursor-pointer">
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>{currentChartTitle}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[520px] max-h-[400px] overflow-y-auto">
          {projectGroups.map((group, groupIndex) => (
            <div key={group.master.id}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              {/* Master */}
              <DropdownMenuItem asChild>
                <Link
                  href={buildHref(group.master.id)}
                  className={`flex items-center gap-2 w-full py-2 ${
                    group.master.id === currentChartId ? "bg-blue-50" : ""
                  }`}
                >
                  <DepthBadge depth={group.master.depth} />
                  <span className={`text-sm leading-snug flex-1 ${
                    group.master.id === currentChartId ? "text-blue-700 font-medium" : ""
                  }`}>
                    {group.master.title}
                  </span>
                  {snapshotCounts[group.master.id] > 0 && (
                    <span className="text-[10px] text-gray-400 shrink-0">
                      📸 {snapshotCounts[group.master.id]}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
              {/* Children by depth */}
              {Object.entries(group.layers)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([depth, charts]) =>
                  charts.map((chart) => (
                    <DropdownMenuItem key={chart.id} asChild>
                      <Link
                        href={buildHref(chart.id)}
                        className={`flex items-center gap-2 w-full py-2 ${
                          chart.id === currentChartId ? "bg-blue-50" : ""
                        }`}
                        style={{ paddingLeft: `${(Number(depth) - 1) * 16 + 8}px` }}
                      >
                        <DepthBadge depth={chart.depth} />
                        <span className={`text-sm leading-snug flex-1 ${
                          chart.id === currentChartId ? "text-blue-700 font-medium" : ""
                        }`}>
                          {chart.title}
                        </span>
                        {snapshotCounts[chart.id] > 0 && (
                          <span className="text-[10px] text-gray-400 shrink-0">
                            📸 {snapshotCounts[chart.id]}
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  ))
                )}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Link
        href={editorHref}
        className="inline-flex items-center gap-1 text-xs text-zenshin-navy/40 hover:text-zenshin-navy/70 transition-colors shrink-0"
        title="Open in Editor"
      >
        <ExternalLink className="w-3 h-3" />
        Editor
      </Link>
    </div>
  );
}
