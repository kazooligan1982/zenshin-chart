export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces } from "@/lib/workspace";
import { DEFAULT_WS_NAMES } from "@/lib/workspace-utils";
import { LayoutGrid } from "lucide-react";

function getWorkspaceDisplayName(
  name: string | null | undefined,
  t: (key: string) => string
): string {
  if (!name || DEFAULT_WS_NAMES.includes(name)) return t("sidebar.defaultWorkspaceName");
  return name;
}

export default async function WorkspaceSelectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) redirect("/charts"); // getOrCreateWorkspace で作成される
  if (workspaces.length === 1) redirect(`/workspaces/${workspaces[0].id}/charts`);

  const t = await getTranslations("workspaces");
  const tSidebar = await getTranslations("sidebar");

  return (
    <div className="min-h-screen bg-zenshin-cream flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src="/zenshin-icon.svg" alt="ZENSHIN" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-zenshin-navy">{t("title")}</h1>
          <p className="text-sm text-zenshin-navy/60 mt-2">{t("subtitle")}</p>
        </div>

        <div className="space-y-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/workspaces/${ws.id}/charts`}
              className="flex items-center gap-4 p-4 rounded-xl bg-white border border-zenshin-navy/10 hover:border-zenshin-teal/40 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 bg-zenshin-navy rounded-lg flex items-center justify-center text-white font-semibold shrink-0">
                {getWorkspaceDisplayName(ws.name, tSidebar).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zenshin-navy truncate">
                  {getWorkspaceDisplayName(ws.name, tSidebar)}
                </p>
                <p className="text-xs text-zenshin-navy/50 capitalize">{ws.role}</p>
              </div>
              <LayoutGrid className="w-5 h-5 text-zenshin-navy/30 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
