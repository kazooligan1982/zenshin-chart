export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPendingInvitations } from "./actions";
import { MembersPageContent } from "./members-page-content";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/");

  // Step 1: workspace_members を取得
  const { data: memberRows, error: memberError } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", wsId);

  if (memberError) {
    console.error("[MembersPage] workspace_members error:", memberError);
  }

  // Step 2: profiles を別クエリで取得
  const userIds = (memberRows ?? []).map((m) => m.user_id);

  const { data: profileRows, error: profileError } = userIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, email, name, avatar_url")
        .in("id", userIds)
    : { data: [] as { id: string; email: string | null; name: string | null; avatar_url: string | null }[], error: null };

  if (profileError) {
    console.error("[MembersPage] profiles error:", profileError);
  }

  // Step 3: コード側で merge
  const profileMap = new Map(
    (profileRows ?? []).map((p) => [p.id, p])
  );

  const members = (memberRows ?? []).map((m) => {
    const p = profileMap.get(m.user_id);
    return {
      id: m.user_id,
      email: p?.email || "",
      name: p?.name || undefined,
      role: m.role,
      avatar_url: p?.avatar_url || undefined,
    };
  });

  const pendingInvitations = await getPendingInvitations(wsId);

  return (
    <MembersPageContent
      workspaceId={wsId}
      currentUserId={user.id}
      currentRole={membership.role}
      initialMembers={members}
      initialPendingInvitations={pendingInvitations}
    />
  );
}
