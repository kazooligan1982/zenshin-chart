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

  // Query workspace members directly instead of calling getWorkspaceMembers()
  // which is in a "use server" file and may lose auth context.
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select(`user_id, role, profiles(email, name, avatar_url)`)
    .eq("workspace_id", wsId);

  const members = (memberRows || []).map((m) => {
    const profile = m.profiles as unknown as { email?: string; name?: string; avatar_url?: string } | null;
    return {
      id: m.user_id,
      email: profile?.email || "",
      name: profile?.name,
      role: m.role,
      avatar_url: profile?.avatar_url,
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
