"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * ログイン後の着地先として適切なワークスペースIDを取得する。
 * 常に自分がOwnerのワークスペースのみを返す（last_workspace_id はリダイレクトには使わない）。
 * @returns OwnerのWS ID、または null（OwnerのWSがない場合）
 */
export async function getPreferredWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: members } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  if (!members || members.length === 0) return null;

  const ownerWs = members.find((m) => m.role === "owner");
  return ownerWs ? ownerWs.workspace_id : null;
}

/**
 * ユーザーがワークスペースにアクセスした際に last_workspace_id を更新する。
 */
export async function updateLastWorkspace(workspaceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        last_workspace_id: workspaceId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
}

export async function getOrCreateWorkspace(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("認証が必要です");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: members, error: _memberLookupError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);

  if (members && members.length > 0) return members[0].workspace_id;

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({
      name: "マイワークスペース",
      owner_id: user.id,
      is_personal: true,
    })
    .select()
    .single();

  if (wsError) throw wsError;

  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) throw memberError;

  await supabase
    .from("charts")
    .update({ workspace_id: workspace.id })
    .eq("user_id", user.id)
    .is("workspace_id", null);

  return workspace.id;
}

// 招待コードを生成（ランダムな8文字）
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 招待リンクを作成
export async function createInvitation(
  workspaceId: string
): Promise<{ code: string; url: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 既存の有効な招待があれば返す
  const { data: existing } = await supabase
    .from("workspace_invitations")
    .select("invite_code")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .single();

  if (existing) {
    return {
      code: existing.invite_code,
      url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${existing.invite_code}`,
    };
  }

  // 新規作成
  const code = generateInviteCode();
  const { error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspaceId,
      invite_code: code,
      created_by: user.id,
    });

  if (error) {
    console.error("Failed to create invitation:", error);
    return null;
  }

  return {
    code,
    url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${code}`,
  };
}

// 招待コードからワークスペース情報を取得
export async function getInvitationByCode(code: string): Promise<{
  workspaceId: string;
  workspaceName: string;
} | null> {
  const supabase = await createClient();

  const { data: invitation } = await supabase
    .from("workspace_invitations")
    .select("workspace_id, workspaces(name)")
    .eq("invite_code", code)
    .eq("is_active", true)
    .single();

  if (!invitation) return null;

  return {
    workspaceId: invitation.workspace_id,
    workspaceName: (invitation.workspaces as unknown as { name?: string } | null)?.name || "ワークスペース",
  };
}

// 招待を受けてワークスペースに参加
export async function joinWorkspaceByInvite(
  code: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "loginRequired" };

  // 招待を取得
  const { data: invitation } = await supabase
    .from("workspace_invitations")
    .select("workspace_id")
    .eq("invite_code", code)
    .eq("is_active", true)
    .single();

  if (!invitation) return { success: false, error: "invalidInvite" };

  // 既にメンバーか確認
  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", invitation.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (existingMember) {
    return { success: true }; // 既にメンバー
  }

  // メンバーとして追加
  const { error } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: invitation.workspace_id,
      user_id: user.id,
      role: "editor",
    });

  if (error) {
    // 既に参加済みの場合は成功として扱う
    if (error.code === "23505") {
      return { success: true };
    }
    console.error("[joinWorkspaceByInvite] Failed to join workspace:", error);
    return { success: false, error: "joinFailed" };
  }

  return { success: true };
}

// ワークスペースのメンバー一覧を取得
export async function getWorkspaceMembers(workspaceId: string): Promise<
  {
    id: string;
    email: string;
    name?: string;
    role: string;
    avatar_url?: string;
  }[]
> {
  const supabase = await createClient();

  const { data: memberRows, error: memberError } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);

  if (memberError) {
    console.error("[getWorkspaceMembers] workspace_members error:", memberError);
  }

  if (!memberRows || memberRows.length === 0) return [];

  const userIds = memberRows.map((m) => m.user_id);

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, name, avatar_url")
    .in("id", userIds);

  if (profileError) {
    console.error("[getWorkspaceMembers] profiles error:", profileError);
  }

  const profileMap = new Map(
    (profileRows ?? []).map((p) => [p.id, p])
  );

  return memberRows.map((m) => {
    const p = profileMap.get(m.user_id);
    return {
      id: m.user_id,
      email: p?.email || "",
      name: p?.name || undefined,
      role: m.role,
      avatar_url: p?.avatar_url || undefined,
    };
  });
}

// 現在のワークスペースIDを取得
export async function getCurrentWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  return member?.workspace_id || null;
}

// 現在のワークスペース情報を取得
export async function getCurrentWorkspace(): Promise<{
  id: string;
  name: string;
  role: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", user.id)
    .single();

  if (!member) return null;

  return {
    id: member.workspace_id,
    name: (member.workspaces as unknown as { name?: string } | null)?.name || "マイワークスペース",
    role: member.role,
  };
}

// ユーザーが所属する全ワークスペースを取得
export async function getUserWorkspaces(): Promise<
  {
    id: string;
    name: string;
    role: string;
  }[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: members } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", user.id);

  if (!members) return [];

  return members.map((m) => ({
    id: m.workspace_id,
    name: (m.workspaces as unknown as { name?: string } | null)?.name || "ワークスペース",
    role: m.role,
  }));
}

// メンバーをワークスペースから削除
export async function removeMember(
  workspaceId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "authRequired" };

  // 操作者の権限を確認
  const { data: currentMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!currentMember || !["owner"].includes(currentMember.role)) {
    return { success: false, error: "noPermission" };
  }

  // 対象メンバーの権限を確認
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId)
    .single();

  if (!targetMember) {
    return { success: false, error: "memberNotFound" };
  }

  // オーナーは削除できない
  if (targetMember.role === "owner") {
    return { success: false, error: "cannotRemoveOwner" };
  }

  // 自分自身は削除できない
  if (targetUserId === user.id) {
    return { success: false, error: "cannotRemoveSelf" };
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId);

  if (error) {
    console.error("[removeMember] Failed:", error);
    return { success: false, error: "deleteFailed" };
  }

  return { success: true };
}

// 新しいワークスペースを作成
export async function createNewWorkspace(
  name: string
): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({
      name,
      owner_id: user.id,
    })
    .select()
    .single();

  if (wsError) {
    console.error("[createNewWorkspace] Failed:", wsError);
    return null;
  }

  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) {
    console.error("[createNewWorkspace] Failed to add owner:", memberError);
    return null;
  }

  return { id: workspace.id, name: workspace.name };
}
