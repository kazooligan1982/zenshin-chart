"use server";

import { createClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function inviteMember(wsId: string, email: string, role: string) {
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
    throw new Error("招待する権限がありません");
  }

  // profiles の email から id を取得し、workspace_members で既存メンバーかチェック
  // profiles に email カラムがない場合やアクセスエラー時はスキップ（重複はDBのユニーク制約で防ぐ）
  const { data: profileByEmail, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!profileError && profileByEmail) {
    const { data: existingMember } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("user_id", profileByEmail.id)
      .maybeSingle();

    if (existingMember) {
      throw new Error("このユーザーは既にメンバーです");
    }
  }

  const { data: existingInvite } = await supabase
    .from("workspace_invitation_requests")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    throw new Error("このメールアドレスには既に招待を送信済みです");
  }

  const { data: invitation, error } = await supabase
    .from("workspace_invitation_requests")
    .insert({
      workspace_id: wsId,
      email,
      role,
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) {
    logger.error("Invitation insert error:", error);
    throw new Error("招待の作成に失敗しました: " + error.message);
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", wsId)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const inviteUrl = `${BASE_URL}/invite/${invitation.token}`;

  try {
    await sendInvitationEmail({
      to: email,
      workspaceName: workspace?.name || "ワークスペース",
      inviterName: profile?.name || "メンバー",
      role,
      inviteUrl,
    });
  } catch (emailError) {
    logger.error("Email send failed:", emailError);
  }

  revalidatePath(`/workspaces/${wsId}/settings/members`);
  return { success: true, token: invitation.token };
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const { data: invitation, error } = await supabase
    .from("workspace_invitation_requests")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (error || !invitation) {
    throw new Error("招待が見つからないか、既に使用済みです");
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase
      .from("workspace_invitation_requests")
      .update({ status: "expired" })
      .eq("id", invitation.id);
    throw new Error("招待の有効期限が切れています");
  }

  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", invitation.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (existingMember) {
    await supabase
      .from("workspace_invitation_requests")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
    return { workspaceId: invitation.workspace_id, alreadyMember: true };
  }

  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: invitation.workspace_id,
    user_id: user.id,
    role: invitation.role,
  });

  if (memberError) throw new Error("ワークスペースへの参加に失敗しました");

  await supabase
    .from("workspace_invitation_requests")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return { workspaceId: invitation.workspace_id, alreadyMember: false };
}

export async function revokeInvitation(wsId: string, invitationId: string) {
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
    throw new Error("招待を取り消す権限がありません");
  }

  const { error } = await supabase
    .from("workspace_invitation_requests")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("workspace_id", wsId);

  if (error) throw new Error("招待の取り消しに失敗しました");

  revalidatePath(`/workspaces/${wsId}/settings/members`);
  return { success: true };
}

export async function getPendingInvitations(wsId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return [];
  }

  const { data } = await supabase
    .from("workspace_invitation_requests")
    .select("id, email, role, created_at, status")
    .eq("workspace_id", wsId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []).filter((inv) => inv.status === "pending");
}
