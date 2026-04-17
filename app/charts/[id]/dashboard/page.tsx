export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: chart } = await supabase
    .from("charts")
    .select("workspace_id")
    .eq("id", id)
    .single();

  if (chart?.workspace_id) {
    redirect(`/workspaces/${chart.workspace_id}/charts/${id}/dashboard`);
  }
  redirect("/");
}
