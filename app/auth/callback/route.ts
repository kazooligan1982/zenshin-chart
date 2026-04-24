import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  getOrCreateWorkspace,
  getPreferredWorkspaceId,
  getUserWorkspaces,
} from "@/lib/workspace";
import { logger } from "@/lib/logger";

async function autoAcceptPendingInvitations(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    // 自分のメールアドレス宛の未承認招待を検索
    const { data: pendingInvites } = await supabase
      .from("workspace_invitation_requests")
      .select("id, workspace_id, role, token")
      .eq("email", user.email)
      .eq("status", "pending");

    if (!pendingInvites || pendingInvites.length === 0) return null;

    let lastWorkspaceId: string | null = null;

    for (const invite of pendingInvites) {
      // 既にメンバーかチェック
      const { data: existing } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!existing) {
        // workspace_membersにINSERT
        const { error } = await supabase.from("workspace_members").insert({
          workspace_id: invite.workspace_id,
          user_id: user.id,
          role: invite.role,
        });
        if (!error) lastWorkspaceId = invite.workspace_id;
      }

      // 招待ステータスをacceptedに更新
      await supabase
        .from("workspace_invitation_requests")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
    }

    return lastWorkspaceId;
  } catch (error) {
    logger.error("[auth/callback] auto-accept invitations error:", error);
    return null;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  let next = requestUrl.searchParams.get("next") || "/charts";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // 招待リンク経由の場合はそのままリダイレクト（invite page がacceptInvitationを処理）
    if (next.startsWith("/invite/")) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }

    // メールアドレス宛の未承認招待を自動承認（サインアップ後のセーフティネット）
    const acceptedWorkspaceId = await autoAcceptPendingInvitations(supabase);
    if (acceptedWorkspaceId) {
      next = `/workspaces/${acceptedWorkspaceId}/charts`;
    } else {
      try {
        if (next === "/charts") {
          const preferredId = await getPreferredWorkspaceId();
          if (preferredId) {
            next = `/workspaces/${preferredId}/charts`;
          } else {
            const workspaces = await getUserWorkspaces();
            if (workspaces.length === 0) {
              const workspaceId = await getOrCreateWorkspace();
              next = `/workspaces/${workspaceId}/charts`;
            } else {
              next = "/workspaces";
            }
          }
        }
      } catch (error) {
        logger.error("[auth/callback] workspace resolution error:", error);
      }
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
