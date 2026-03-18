"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

// deleteWorkspace Server Action was removed because its redirect() call
// triggers the React 19 hooks bug (facebook/react#33580) on the client.
// Workspace deletion now uses the API route: DELETE /api/workspaces/[wsId]
// with window.location.href for navigation (see workspace-general-settings.tsx).

