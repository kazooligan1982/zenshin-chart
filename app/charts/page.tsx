export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getOrCreateWorkspace,
  getPreferredWorkspaceId,
  getUserWorkspaces,
} from "@/lib/workspace";

export default async function ChartsRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const preferredId = await getPreferredWorkspaceId();
  if (preferredId) {
    redirect(`/workspaces/${preferredId}/charts`);
  }

  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) {
    const workspaceId = await getOrCreateWorkspace();
    redirect(`/workspaces/${workspaceId}/charts`);
  }

  redirect("/workspaces");
}
