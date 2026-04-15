import Link from "next/link";
import { Archive, FolderOpen } from "lucide-react";
import { getArchivedCharts } from "@/lib/charts-actions";

export default async function SettingsPage() {
  const archivedCharts = await getArchivedCharts();

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="flex items-center gap-3 mb-8">
        <Archive className="w-7 h-7 text-zenshin-navy/40" />
        <h1 className="text-2xl font-bold text-zenshin-navy">アーカイブされたチャート</h1>
      </div>

      {archivedCharts.length === 0 ? (
        <div className="text-center py-16">
          <Archive className="w-12 h-12 mx-auto mb-4 text-zenshin-navy/20" />
          <p className="text-zenshin-navy/40">アーカイブされたチャートはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {archivedCharts.map((chart) => (
            <Link
              key={chart.id}
              href={`/charts/${chart.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-zenshin-navy/8 hover:border-zenshin-navy/20 hover:shadow-sm transition-all"
            >
              <FolderOpen className="w-5 h-5 text-zenshin-navy/40" />
              <div>
                <p className="font-medium text-zenshin-navy">{chart.title}</p>
                <p className="text-sm text-zenshin-navy/40">
                  アーカイブ日:{" "}
                  {new Date(chart.archived_at).toLocaleDateString("ja-JP")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
