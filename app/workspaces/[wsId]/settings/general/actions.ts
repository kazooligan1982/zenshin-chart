"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isDefaultWorkspaceName } from "@/lib/workspace-utils";

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
    .select("owner_id, name")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
  }
  if (isDefaultWorkspaceName(workspace.name)) {
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
    .select("owner_id, name")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    throw new Error("Forbidden");
  }
  if (isDefaultWorkspaceName(workspace.name)) {
    throw new Error("Default workspace cannot be deleted");
  }

  const serviceClient = createServiceRoleClient();
  const errors: string[] = [];

  // Helper: delete from table, log errors but continue
  async function safeDelete(table: string, column: string, value: string) {
    const { error } = await serviceClient.from(table).delete().eq(column, value);
    if (error) {
      console.error(`[deleteWorkspace] ${table}: ${error.message}`);
      errors.push(`${table}: ${error.message}`);
    }
  }

  // Delete in dependency order (children first)
  // 1. Tables referencing workspace_id (explicit delete for safety)
  await safeDelete("chart_proposals", "workspace_id", wsId);
  await safeDelete("workspace_slack_settings", "workspace_id", wsId);
  await safeDelete("workspace_invitation_requests", "workspace_id", wsId);
  await safeDelete("momentum_scores", "workspace_id", wsId);

  // 2. Charts (workspace_id is ON DELETE SET NULL — must delete explicitly)
  //    Child tables (visions, realities, tensions, actions, snapshots, etc.) cascade from charts
  await safeDelete("charts", "workspace_id", wsId);

  // 3. Members (has CASCADE but explicit for clarity)
  await safeDelete("workspace_members", "workspace_id", wsId);

  // 4. Clear last_workspace_id references in user_preferences
  await serviceClient
    .from("user_preferences")
    .update({ last_workspace_id: null })
    .eq("last_workspace_id", wsId);

  // 5. Delete the workspace itself
  const { error } = await serviceClient
    .from("workspaces")
    .delete()
    .eq("id", wsId);

  if (error) {
    console.error("[deleteWorkspace] Final delete failed:", error);
    throw new Error(`Failed to delete workspace: ${error.message}`);
  }

  if (errors.length > 0) {
    console.warn("[deleteWorkspace] Completed with warnings:", errors);
  }
}
