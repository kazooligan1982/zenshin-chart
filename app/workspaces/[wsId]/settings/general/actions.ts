"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

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
    .select("owner_id")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
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
    .select("owner_id")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
  }

  const serviceClient = createServiceRoleClient();

  // Delete related data in order
  await serviceClient
    .from("workspace_slack_settings")
    .delete()
    .eq("workspace_id", wsId);

  await serviceClient
    .from("workspace_invitations")
    .delete()
    .eq("workspace_id", wsId);

  // Delete all charts in the workspace
  await serviceClient.from("charts").delete().eq("workspace_id", wsId);

  // Delete members
  await serviceClient
    .from("workspace_members")
    .delete()
    .eq("workspace_id", wsId);

  // Delete the workspace itself
  const { error } = await serviceClient
    .from("workspaces")
    .delete()
    .eq("id", wsId);

  if (error) throw new Error("Failed to delete workspace");
}
