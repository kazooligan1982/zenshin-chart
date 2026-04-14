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

  // Delete related data in dependency order (children first)
  // 1. Tables referencing workspace_id without ON DELETE CASCADE
  await serviceClient
    .from("chart_proposals")
    .delete()
    .eq("workspace_id", wsId);

  await serviceClient
    .from("workspace_slack_settings")
    .delete()
    .eq("workspace_id", wsId);

  // 2. Invitation requests (correct table name; has CASCADE but explicit is safer)
  await serviceClient
    .from("workspace_invitation_requests")
    .delete()
    .eq("workspace_id", wsId);

  // 3. Momentum scores referencing workspace_id
  await serviceClient
    .from("momentum_scores")
    .delete()
    .eq("workspace_id", wsId);

  // 4. Charts (workspace_id is ON DELETE SET NULL, so must delete explicitly)
  //    Child tables (visions, realities, tensions, actions, etc.) cascade from charts
  await serviceClient.from("charts").delete().eq("workspace_id", wsId);

  // 5. Members (has CASCADE but explicit for clarity)
  await serviceClient
    .from("workspace_members")
    .delete()
    .eq("workspace_id", wsId);

  // 6. Delete the workspace itself
  const { error } = await serviceClient
    .from("workspaces")
    .delete()
    .eq("id", wsId);

  if (error) {
    console.error("[deleteWorkspace] Failed:", error);
    throw new Error("Failed to delete workspace");
  }
}
