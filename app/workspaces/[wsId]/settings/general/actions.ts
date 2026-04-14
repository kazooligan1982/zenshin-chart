"use server";

import { createClient } from "@/lib/supabase/server";
import { isPersonalWorkspace } from "@/lib/workspace-utils";

export async function updateWorkspaceName(wsId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (trimmed.length > 100) throw new Error("Name is too long");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id, is_personal, name")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
  }
  if (isPersonalWorkspace(workspace)) {
    throw new Error("Default workspace cannot be renamed");
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", wsId);

  if (error) throw new Error("Failed to update workspace name");
}

export async function deleteWorkspace(wsId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id, is_personal, name")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
  }
  if (isPersonalWorkspace(workspace)) {
    throw new Error("Default workspace cannot be deleted");
  }

  // Use authenticated client — RLS allows owner to delete their own workspace.
  // Cascade rules handle cleanup:
  //   CASCADE: workspace_members, workspace_invitation_requests,
  //            workspace_slack_settings, chart_proposals
  //   SET NULL: charts.workspace_id — must delete charts explicitly first

  // 1. Delete charts (SET NULL FK — won't cascade, so delete explicitly)
  const { error: chartsError } = await supabase
    .from("charts")
    .delete()
    .eq("workspace_id", wsId);
  if (chartsError) {
    console.error("[deleteWorkspace] charts:", chartsError);
    throw new Error(`Failed to delete charts: ${chartsError.message}`);
  }

  // 2. Delete workspace — cascades to members, invitations, slack settings, proposals
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", wsId);

  if (error) {
    console.error("[deleteWorkspace] workspace:", error);
    throw new Error(`Failed to delete workspace: ${error.message}`);
  }
}
