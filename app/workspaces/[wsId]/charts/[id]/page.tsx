export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { fetchChart } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceMembers } from "@/lib/workspace";
import { ProjectEditor } from "./project-editor";

interface PageProps {
  params: Promise<{ wsId: string; id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { wsId, id } = await params;
  
  try {
    const supabase = await createClient();

    // ユーザー取得とチャート取得を並列実行
    const [{ data: { user } }, chart] = await Promise.all([
      supabase.auth.getUser(),
      fetchChart(id),
    ]);

    let currentUser = null;
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

    if (!chart) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        return (
          <div className="flex items-center justify-center h-screen bg-zenshin-cream">
            <div className="bg-white p-8 rounded-2xl border border-zenshin-navy/8 max-w-md">
              <h2 className="text-xl font-bold text-zenshin-navy mb-4">Supabase設定が必要です</h2>
              <p className="text-sm text-zenshin-navy/40 mb-4">
                データベースに接続するには、環境変数を設定してください。
              </p>
              <div className="bg-zenshin-cream p-4 rounded-xl text-xs font-mono">
                <p className="mb-2">.env.local ファイルに以下を追加：</p>
                <p>NEXT_PUBLIC_SUPABASE_URL=your_url</p>
                <p>NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key</p>
              </div>
            </div>
          </div>
        );
      }
      
      notFound();
    }

    const workspaceId = wsId || chart.workspace_id;
    let workspaceMembers: { id: string; email: string; name?: string; role: string; avatar_url?: string }[] = [];
    let currentUserRole = "viewer";
    if (workspaceId) {
      workspaceMembers = await getWorkspaceMembers(workspaceId);
      if (user) {
        // getWorkspaceMembers uses "use server" context which may lose auth.
        // Directly query the current user's role as a reliable fallback.
        const found = workspaceMembers.find((m) => m.id === user.id);
        if (found) {
          currentUserRole = found.role;
        } else {
          const { data: directRole } = await supabase
            .from("workspace_members")
            .select("role")
            .eq("workspace_id", workspaceId)
            .eq("user_id", user.id)
            .single();
          currentUserRole = directRole?.role || "viewer";
        }
      }
    }

    return (
      <ProjectEditor
        initialChart={chart}
        chartId={id}
        workspaceId={workspaceId ?? ""}
        currentUserId={user?.id ?? ""}
        currentUser={currentUser}
        workspaceMembers={workspaceMembers}
        currentUserRole={currentUserRole}
      />
    );
  } catch (error) {
    console.error("Error loading chart:", error);
    return (
      <div className="flex items-center justify-center h-screen bg-zenshin-cream">
        <div className="bg-white p-8 rounded-2xl border border-zenshin-navy/8 max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">エラーが発生しました</h2>
          <p className="text-sm text-zenshin-navy/40 mb-4">
            データの読み込みに失敗しました。
          </p>
          <p className="text-xs text-zenshin-navy/30">
            {error instanceof Error ? error.message : "不明なエラー"}
          </p>
        </div>
      </div>
    );
  }
}
