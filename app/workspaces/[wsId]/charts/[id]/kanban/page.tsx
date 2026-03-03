export const dynamic = "force-dynamic";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { getWorkspaceMembers } from "@/lib/workspace";
import { KanbanBoard } from "./kanban-board";

interface PageProps {
  params: Promise<{ wsId: string; id: string }>;
}

export default async function KanbanPage({ params }: PageProps) {
  const { wsId, id: projectId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: chart }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("charts").select("id, title, workspace_id").eq("id", projectId).single(),
  ]);

  if (!chart) {
    notFound();
  }

  let currentUser: { id: string; email: string; name?: string; avatar_url?: string | null } | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, name, avatar_url")
      .eq("id", user.id)
      .single();
    currentUser = profile || {
      id: user.id,
      email: user.email || "",
      name: user.user_metadata?.name || user.email?.split("@")[0] || "",
      avatar_url: null,
    };
  }

  const workspaceId = wsId || chart.workspace_id;
  let workspaceMembers: { id: string; email: string; name?: string; role: string; avatar_url?: string }[] = [];
  if (workspaceId) {
    workspaceMembers = await getWorkspaceMembers(workspaceId);
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <KanbanBoard
        projectId={projectId}
        currentUserId={user?.id ?? ""}
        currentUser={currentUser}
        workspaceMembers={workspaceMembers}
        workspaceId={workspaceId ?? undefined}
      />
    </div>
  );
}

