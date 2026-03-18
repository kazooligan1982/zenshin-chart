import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isDefaultWorkspaceName } from "@/lib/workspace-utils";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", wsId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prevent deletion of the default personal workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name, owner_id")
      .eq("id", wsId)
      .single();

    if (workspace && workspace.owner_id === user.id && isDefaultWorkspaceName(workspace.name)) {
      return NextResponse.json(
        { error: "Cannot delete the default workspace" },
        { status: 400 }
      );
    }

    // charts は ON DELETE SET NULL なので先に削除
    const { data: charts } = await supabase
      .from("charts")
      .select("id")
      .eq("workspace_id", wsId);

    if (charts && charts.length > 0) {
      const chartIds = charts.map((c) => c.id);

      for (const chartId of chartIds) {
        await supabase.from("actions").delete().eq("chart_id", chartId);
        await supabase.from("tensions").delete().eq("chart_id", chartId);
        await supabase.from("visions").delete().eq("chart_id", chartId);
        await supabase.from("realities").delete().eq("chart_id", chartId);
        await supabase.from("snapshots").delete().eq("chart_id", chartId);
      }

      await supabase.from("charts").delete().in("id", chartIds);
    }

    await supabase
      .from("workspace_slack_settings")
      .delete()
      .eq("workspace_id", wsId);

    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", wsId);

    if (error) {
      console.error("[deleteWorkspace] error:", error);
      return NextResponse.json(
        { error: "Failed to delete" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/workspaces/[wsId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
