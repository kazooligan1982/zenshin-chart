export const dynamic = "force-dynamic";
import { getTranslations } from "next-intl/server";
import { Archive, FolderOpen } from "lucide-react";
import { getArchivedCharts } from "@/app/charts/actions";
import { ArchivedChartCard } from "./archived-chart-card";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations("archive");
  const archivedCharts = await getArchivedCharts(wsId);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="flex items-center gap-3 mb-8">
        <Archive className="w-7 h-7 text-zenshin-navy/40" />
        <div>
          <h1 className="text-2xl font-bold text-zenshin-navy">{t("title")}</h1>
          <p className="text-sm text-zenshin-navy/40">{t("description")}</p>
        </div>
      </div>

      {archivedCharts.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-zenshin-navy/20" />
          <p className="text-zenshin-navy/40">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {archivedCharts.map((chart) => (
            <ArchivedChartCard key={chart.id} chart={chart} />
          ))}
        </div>
      )}
    </div>
  );
}
