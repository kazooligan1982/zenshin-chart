"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function disconnectSlack(wsId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
  }

  const serviceClient = createServiceRoleClient();
  const { data: settings } = await serviceClient
    .from("workspace_slack_settings")
    .select("slack_bot_token")
    .eq("workspace_id", wsId)
    .single();

  if (settings?.slack_bot_token) {
    try {
      await fetch("https://slack.com/api/auth.revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.slack_bot_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
    } catch (e) {
      logger.error("Failed to revoke Slack token:", e);
    }
  }

  const { error } = await serviceClient
    .from("workspace_slack_settings")
    .delete()
    .eq("workspace_id", wsId);

  if (error) throw new Error("Failed to disconnect");
}
