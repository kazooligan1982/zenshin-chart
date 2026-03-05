export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Archive, FolderOpen } from "lucide-react";
import { getArchivedCharts } from "@/app/charts/actions";
import { ArchivedChartCard } from "./archived-chart-card";
import { SlackNotificationToggle } from "../slack-notification-toggle";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: workspace }, { data: membership }, archivedCharts] = await Promise.all([
    supabase.from("workspaces").select("slack_notify").eq("id", wsId).single(),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", wsId)
      .eq("user_id", user.id)
      .single(),
    getArchivedCharts(wsId),
  ]);

  const t = await getTranslations("archive");
  const slackNotify = workspace?.slack_notify ?? false;
  const canEditSlack = membership?.role === "owner";

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <SlackNotificationToggle
        wsId={wsId}
        initialEnabled={slackNotify}
        canEdit={canEditSlack}
      />

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
