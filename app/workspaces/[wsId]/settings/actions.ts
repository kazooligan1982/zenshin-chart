"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateSlackNotify(wsId: string, enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("認証が必要です");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    throw new Error("この設定を変更する権限がありません");
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ slack_notify: enabled })
    .eq("id", wsId);

  if (error) {
    console.error("[updateSlackNotify] error:", error);
    throw new Error("設定の更新に失敗しました");
  }

  revalidatePath(`/workspaces/${wsId}/settings`);
  revalidatePath(`/workspaces/${wsId}/settings/archive`);
  return { success: true };
}
