export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getWorkspaceMembers } from "@/lib/workspace";
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

  const [members, pendingInvitations] = await Promise.all([
    getWorkspaceMembers(wsId),
    getPendingInvitations(wsId),
  ]);

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
