export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsNav } from "../settings-nav";
import { WorkspaceGeneralSettings } from "./workspace-general-settings";

export default async function GeneralSettingsPage({
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

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, owner_id")
    .eq("id", wsId)
    .single();
  if (!workspace) redirect("/");

  const isOwner = workspace.owner_id === user.id;

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <SettingsNav wsId={wsId} />
      <WorkspaceGeneralSettings
        wsId={wsId}
        workspaceName={workspace.name}
        isOwner={isOwner}
      />
    </div>
  );
}
