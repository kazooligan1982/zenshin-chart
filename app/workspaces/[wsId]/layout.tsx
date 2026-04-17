import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { updateLastWorkspace } from "@/lib/workspace";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check workspace exists first (may have been deleted)
  const { data: wsExists } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", wsId)
    .single();
  if (!wsExists) redirect("/charts");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name)")
    .eq("workspace_id", wsId)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/charts");

  await updateLastWorkspace(wsId);

  const { data: allMembers } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name)")
    .eq("user_id", user.id);

  const workspaces =
    allMembers?.map((m: { role: string; workspaces: { id: string; name: string } | { id: string; name: string }[] | null }) => {
      const ws = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
      return {
        id: ws?.id ?? "",
        name: ws?.name ?? "ワークスペース",
        role: m.role,
      };
    }) ?? [];

  const membershipWs = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces;
  const currentWorkspace = {
    id: (membershipWs as { id: string; name: string } | null)?.id ?? wsId,
    name: (membershipWs as { id: string; name: string } | null)?.name ?? "ワークスペース",
    role: membership.role,
  };

  return (
    <div className="flex h-screen bg-zenshin-cream">
      <Sidebar
        currentWsId={wsId}
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
      />
      <main className="flex-1 pl-16 min-h-screen overflow-auto">{children}</main>
    </div>
  );
}
