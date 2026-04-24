import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getInvitationByCode, joinWorkspaceByInvite } from "@/lib/workspace";
import { acceptInvitation } from "@/app/workspaces/[wsId]/settings/members/actions";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Crown, Stethoscope, Shield, Eye, User } from "lucide-react";
import { ROLE_ICONS, type WorkspaceRole } from "@/lib/permissions";

const ROLE_ICON_MAP = {
  Crown,
  Stethoscope,
  Shield,
  Eye,
} as const;

function InviteRoleIcon({ role }: { role: string }) {
  const iconName = ROLE_ICONS[role as WorkspaceRole] ?? "Eye";
  const Icon = ROLE_ICON_MAP[iconName as keyof typeof ROLE_ICON_MAP] ?? Eye;
  const colorClass =
    role === "owner"
      ? "text-amber-500"
      : role === "consultant"
        ? "text-violet-500"
        : role === "editor"
          ? "text-zenshin-teal"
          : "text-gray-400";
  return <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />;
}
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("invite");
  const tMembers = await getTranslations("members");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Try workspace_invitation_requests (new email invite flow)
  const { data: requestInvitation } = await supabase
    .from("workspace_invitation_requests")
    .select("id, workspace_id, email, role, expires_at, invited_by, workspaces(name)")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (requestInvitation) {
    const isExpired = new Date(requestInvitation.expires_at) < new Date();
    let workspaceName: string | undefined;

    const wsData = Array.isArray(requestInvitation.workspaces)
      ? requestInvitation.workspaces[0]
      : requestInvitation.workspaces;
    workspaceName = (wsData as { name?: string } | null)?.name;
    logger.info("[invite] workspace from JOIN", {
      hasWorkspace: !!wsData,
      hasWorkspaceName: !!workspaceName,
    });

    if (!workspaceName && requestInvitation.workspace_id) {
      const { data: ws, error: wsError } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", requestInvitation.workspace_id)
        .single();
      workspaceName = ws?.name;
      logger.info("[invite] workspace from separate query", {
        workspaceIdHash: logger.hashId(requestInvitation.workspace_id),
        hasWs: !!ws,
        hasWorkspaceName: !!workspaceName,
        ...(wsError ? { error: logger.extractSafeError(wsError) } : {}),
      });
    }
    workspaceName = workspaceName || t("workspaceFallback");
    let inviterEmail: string | null = null;
    if (requestInvitation.invited_by) {
      const { data: inviterProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", requestInvitation.invited_by)
        .single();
      inviterEmail = inviterProfile?.email ?? null;
    }
    const roleKey = requestInvitation.role as "owner" | "consultant" | "editor" | "viewer";
    const roleLabel =
      ["owner", "consultant", "editor", "viewer"].includes(requestInvitation.role)
        ? tMembers(`role.${roleKey}`)
        : requestInvitation.role;

    if (isExpired) {
      return (
        <div className="space-y-6">
          <div className="text-center">
            <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
            <div className="flex items-start justify-center gap-1.5">
              <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
              <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
                beta
              </span>
            </div>
            <p className="text-muted-foreground mt-2">{t("inviteExpired")}</p>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground mb-4">
              {t("inviteExpiredDesc")}
            </p>
            <Link href="/">
              <Button
                variant="outline"
                className="w-full border-zenshin-navy/25 hover:border-zenshin-navy/50 hover:bg-zenshin-navy/5 text-zenshin-navy"
              >
                {t("home")}
              </Button>
            </Link>
          </div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="space-y-6">
          <div className="text-center">
            <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
            <div className="flex items-start justify-center gap-1.5">
              <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
              <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
                beta
              </span>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zenshin-navy mb-4">
              {t("inviteTo", { name: workspaceName })}
            </h2>
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <InviteRoleIcon role={requestInvitation.role} />
                <span>{roleLabel}</span>
              </div>
              {inviterEmail && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4 shrink-0 text-gray-400" />
                  <span>{inviterEmail}</span>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <Link href={`/login?redirect=/invite/${token}`}>
                <Button
                  className="w-full py-3 rounded-lg font-bold text-lg bg-zenshin-orange hover:bg-zenshin-orange/90 text-white shadow-sm"
                >
                  {t("loginToAccept")}
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground text-center mt-4">
                {t("noAccount")}{" "}
                <Link
                  href={`/signup?redirect=/invite/${token}`}
                  className="text-zenshin-navy underline hover:no-underline font-medium"
                >
                  {t("signupHere")}
                </Link>
                {t("signupSuffix")}
              </p>
            </div>
          </div>
        </div>
      );
    }

    let redirectUrl: string | null = null;
    let errorMessage: string | null = null;

    try {
      const result = await acceptInvitation(token);
      redirectUrl = `/workspaces/${result.workspaceId}/charts`;
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : t("joinFailed");
    }

    // redirect は try/catch の完全に外（Next.js の redirect() は内部で throw するため）
    if (redirectUrl) {
      redirect(redirectUrl);
    }

    return (
      <div className="space-y-6">
        <div className="text-center">
          <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
          <div className="flex items-start justify-center gap-1.5">
            <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
            <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
              beta
            </span>
          </div>
          <p className="text-muted-foreground mt-2">{t("joinFailed")}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground mb-4">
            {errorMessage ?? t("errorOccurred")}
          </p>
          <Link href="/">
            <Button
              variant="outline"
              className="w-full border-zenshin-navy/25 hover:border-zenshin-navy/50 hover:bg-zenshin-navy/5 text-zenshin-navy"
            >
              {t("home")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 2. Fallback: workspace_invitations (old invite_code flow)
  const invitation = await getInvitationByCode(token);

  if (!invitation) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
          <div className="flex items-start justify-center gap-1.5">
            <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
            <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
              beta
            </span>
          </div>
          <p className="text-muted-foreground mt-2">{t("inviteNotFound")}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground mb-4">
            {t("invalidOrExpired")}
          </p>
          <Link href="/">
            <Button
              variant="outline"
              className="w-full border-zenshin-navy/25 hover:border-zenshin-navy/50 hover:bg-zenshin-navy/5 text-zenshin-navy"
            >
              {t("home")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
            <div className="flex items-start justify-center gap-1.5">
              <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
              <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
                beta
              </span>
            </div>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zenshin-navy mb-4">
            {t("inviteTo", { name: invitation.workspaceName })}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {t("loginRequired")}
          </p>
          <div className="space-y-4">
            <Link href={`/login?redirect=/invite/${token}`}>
              <Button
                className="w-full py-3 rounded-lg font-bold text-lg bg-zenshin-orange hover:bg-zenshin-orange/90 text-white shadow-sm"
              >
                {t("loginToJoin")}
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground text-center mt-4">
              アカウントをお持ちでない方は
              <Link
                href={`/signup?redirect=/invite/${token}`}
                className="text-zenshin-navy underline hover:no-underline font-medium"
              >
                こちら
              </Link>
              から作成
            </p>
          </div>
        </div>
      </div>
    );
  }

  const result = await joinWorkspaceByInvite(token);

  if (result.success) {
    redirect(`/workspaces/${invitation.workspaceId}/charts`);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
        <div className="flex items-start justify-center gap-1.5">
          <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
          <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
            beta
          </span>
        </div>
        <p className="text-muted-foreground mt-2">{t("joinFailed")}</p>
      </div>
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground mb-4">{result.error ? t(result.error as "joinFailed" | "invalidInvite" | "loginRequired") : t("joinFailed")}</p>
        <Link href="/">
          <Button
            variant="outline"
            className="w-full border-zenshin-navy/25 hover:border-zenshin-navy/50 hover:bg-zenshin-navy/5 text-zenshin-navy"
          >
            {t("home")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
