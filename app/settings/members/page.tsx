export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MembersRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: members } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const workspaceId = members?.[0]?.workspace_id;
  if (workspaceId) {
    redirect(`/workspaces/${workspaceId}/settings/members`);
  }

  redirect("/");
}
