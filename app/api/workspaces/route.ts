import { createNewWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isPersonalWorkspace } from "@/lib/workspace-utils";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  try {
    const { wsId } = await request.json();
    if (!wsId) {
      return NextResponse.json({ error: "wsId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id, is_personal, name")
      .eq("id", wsId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isPersonalWorkspace(workspace)) {
      return NextResponse.json(
        { error: "Default workspace cannot be deleted" },
        { status: 400 }
      );
    }

    // Delete charts first (SET NULL FK — won't cascade)
    const { error: chartsError } = await supabase
      .from("charts")
      .delete()
      .eq("workspace_id", wsId);
    if (chartsError) {
      return NextResponse.json(
        { error: `Failed to delete charts: ${chartsError.message}` },
        { status: 500 }
      );
    }

    // Delete workspace — cascades to members, invitations, slack settings, proposals
    const { error } = await supabase.from("workspaces").delete().eq("id", wsId);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete workspace: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/workspaces:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "ワークスペース名は必須です" },
        { status: 400 }
      );
    }

    const workspace = await createNewWorkspace(name.trim());

    if (!workspace) {
      return NextResponse.json(
        { error: "ワークスペースの作成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("Error in POST /api/workspaces:", error);
    return NextResponse.json(
      { error: "内部エラーが発生しました" },
      { status: 500 }
    );
  }
}
