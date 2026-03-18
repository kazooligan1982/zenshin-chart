"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDefaultWorkspaceName } from "@/lib/workspace-utils";

async function requireOwner(wsId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    throw new Error("Forbidden");
  }

  return { supabase, user };
}

export async function updateWorkspaceName(wsId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (trimmed.length > 100) throw new Error("Name too long");

  const { supabase } = await requireOwner(wsId);

  const { error } = await supabase
    .from("workspaces")
    .update({ name: trimmed })
    .eq("id", wsId);

  if (error) {
    console.error("[updateWorkspaceName] error:", error);
    throw new Error("Failed to update");
  }

  revalidatePath(`/workspaces/${wsId}/settings/general`);
  revalidatePath(`/workspaces/${wsId}`);
  return { success: true };
}

export async function deleteWorkspace(wsId: string) {
  const { supabase, user } = await requireOwner(wsId);

  // Prevent deletion of the default personal workspace
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, owner_id")
    .eq("id", wsId)
    .single();

  if (
    workspace &&
    workspace.owner_id === user.id &&
    isDefaultWorkspaceName(workspace.name)
  ) {
    throw new Error("Cannot delete the default workspace");
  }

  // Delete charts and their related data
  const { data: charts } = await supabase
    .from("charts")
    .select("id")
    .eq("workspace_id", wsId);

  if (charts && charts.length > 0) {
    const chartIds = charts.map((c) => c.id);
    for (const chartId of chartIds) {
      await supabase.from("actions").delete().eq("chart_id", chartId);
      await supabase.from("tensions").delete().eq("chart_id", chartId);
      await supabase.from("visions").delete().eq("chart_id", chartId);
      await supabase.from("realities").delete().eq("chart_id", chartId);
      await supabase.from("snapshots").delete().eq("chart_id", chartId);
    }
    await supabase.from("charts").delete().in("id", chartIds);
  }

  await supabase
    .from("workspace_slack_settings")
    .delete()
    .eq("workspace_id", wsId);

  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", wsId);

  if (error) {
    console.error("[deleteWorkspace] error:", error);
    throw new Error("Failed to delete");
  }

  // Determine redirect target
  const { data: remainingMembers } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  let redirectTo = "/charts";
  if (remainingMembers && remainingMembers.length > 0) {
    const ownerWs = remainingMembers.find((m) => m.role === "owner");
    const targetWsId = ownerWs
      ? ownerWs.workspace_id
      : remainingMembers[0].workspace_id;
    redirectTo = `/workspaces/${targetWsId}/charts`;
  }

  // Server-side redirect avoids crashing the Next.js Router component
  // which happens with client-side navigation (router.push / window.location)
  redirect(redirectTo);
}

