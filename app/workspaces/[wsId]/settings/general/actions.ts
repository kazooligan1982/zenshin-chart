"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const { supabase } = await requireOwner(wsId);

  // charts は ON DELETE SET NULL なので先に削除
  const { data: charts } = await supabase
    .from("charts")
    .select("id")
    .eq("workspace_id", wsId);

  if (charts && charts.length > 0) {
    const chartIds = charts.map((c) => c.id);

    // charts 配下のデータを削除（actions, tensions, visions, realities, snapshots 等）
    for (const chartId of chartIds) {
      await supabase.from("actions").delete().eq("chart_id", chartId);
      await supabase.from("tensions").delete().eq("chart_id", chartId);
      await supabase.from("visions").delete().eq("chart_id", chartId);
      await supabase.from("realities").delete().eq("chart_id", chartId);
      await supabase.from("snapshots").delete().eq("chart_id", chartId);
    }

    await supabase.from("charts").delete().in("id", chartIds);
  }

  // workspace_slack_settings は workspace_id で紐付き
  await supabase
    .from("workspace_slack_settings")
    .delete()
    .eq("workspace_id", wsId);

  // workspace 本体を削除（workspace_members, invitations, momentum_scores は CASCADE）
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", wsId);

  if (error) {
    console.error("[deleteWorkspace] error:", error);
    throw new Error("Failed to delete");
  }

  redirect("/");
}
