export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SlackConnect } from "./slack-connect";
import { SettingsNav } from "../settings-nav";

export default async function SlackSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { wsId } = await params;
  const { connected, error } = await searchParams;

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

  // Hide Slack integration when NEXT_PUBLIC_SLACK_CLIENT_ID is not configured
  if (!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID) {
    redirect(`/workspaces/${wsId}/settings/general`);
  }

  const isOwner = workspace.owner_id === user.id;

  const { data: slackSettings } = await supabase
    .from("workspace_slack_settings")
    .select("*")
    .eq("workspace_id", wsId)
    .single();

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <SettingsNav wsId={wsId} />
      <SlackConnect
        wsId={wsId}
        isOwner={isOwner}
        slackSettings={slackSettings}
        justConnected={connected === "true"}
        error={error}
      />
    </div>
  );
}
