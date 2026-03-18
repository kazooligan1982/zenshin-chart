"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Settings, AlertTriangle, Copy, Mail } from "lucide-react";
import { updateWorkspaceName } from "./actions";

interface WorkspaceGeneralSettingsProps {
  wsId: string;
  workspaceName: string;
  isOwner: boolean;
  isDefaultWorkspace: boolean;
}

export function WorkspaceGeneralSettings({
  wsId,
  workspaceName,
  isOwner,
  isDefaultWorkspace,
}: WorkspaceGeneralSettingsProps) {
  const t = useTranslations("workspaceSettings");
  const tc = useTranslations("common");

  const [name, setName] = useState(workspaceName);
  const [isSaving, setIsSaving] = useState(false);

  const hasNameChanged = name.trim() !== workspaceName;

  const workspaceUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/workspaces/${wsId}`
      : `/workspaces/${wsId}`;

  const handleRename = async () => {
    if (!hasNameChanged) return;
    setIsSaving(true);
    try {
      await updateWorkspaceName(wsId, name);
      toast.success(t("renameSuccess"));
    } catch {
      toast.error(t("renameFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(tc("copied"));
    } catch {
      // fallback: do nothing
    }
  };

  const handleRequestDelete = () => {
    const subject = encodeURIComponent(
      t("deleteRequestSubject", { name: workspaceName })
    );
    const body = encodeURIComponent(
      [
        `${t("deleteRequestWorkspaceName")}: ${workspaceName}`,
        `${t("deleteRequestWorkspaceId")}: ${wsId}`,
        `URL: ${workspaceUrl}`,
        "",
        `${t("deleteRequestReason")}:`,
        "",
      ].join("\n")
    );
    window.location.href = `mailto:support@zenshin-chart.com?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-8">
      {/* WS名変更 */}
      <div className="rounded-lg border border-zenshin-navy/10 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-zenshin-navy/40" />
          <h3 className="font-semibold text-zenshin-navy">
            {t("workspaceName")}
          </h3>
        </div>
        <div className="flex gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("workspaceNamePlaceholder")}
            disabled={!isOwner}
            className="flex-1"
            maxLength={100}
          />
          <Button
            onClick={handleRename}
            disabled={!isOwner || !hasNameChanged || !name.trim() || isSaving}
          >
            {isSaving ? tc("saving") : t("rename")}
          </Button>
        </div>
        {!isOwner && (
          <p className="text-sm text-zenshin-navy/40 mt-2">
            {t("ownerOnly")}
          </p>
        )}
      </div>

      {/* ワークスペース削除 */}
      {isOwner && (
        <div className="rounded-lg border border-zenshin-navy/10 bg-white p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-zenshin-navy/40" />
            <h3 className="font-semibold text-zenshin-navy">
              {t("deleteSection")}
            </h3>
          </div>
          {isDefaultWorkspace ? (
            <p className="text-sm text-zenshin-navy/60">
              {t("cannotDeleteDefault")}
            </p>
          ) : (
            <>
              <p className="text-sm text-zenshin-navy/60 mb-4">
                {t("deleteContactDescription")}
              </p>

              {/* ワークスペース情報 */}
              <div className="rounded-md border border-zenshin-navy/10 bg-zenshin-navy/[0.02] p-4 space-y-2 mb-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm min-w-0">
                    <span className="text-zenshin-navy/40">
                      {t("deleteRequestWorkspaceName")}:
                    </span>{" "}
                    <span className="font-medium text-zenshin-navy break-all">
                      {workspaceName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(workspaceName)}
                    className="shrink-0 p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/40 hover:text-zenshin-navy/60 transition-colors"
                    title={tc("copy")}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm min-w-0">
                    <span className="text-zenshin-navy/40">
                      {t("deleteRequestWorkspaceId")}:
                    </span>{" "}
                    <span className="font-mono text-xs text-zenshin-navy break-all">
                      {wsId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(wsId)}
                    className="shrink-0 p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/40 hover:text-zenshin-navy/60 transition-colors"
                    title={tc("copy")}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm min-w-0">
                    <span className="text-zenshin-navy/40">URL:</span>{" "}
                    <span className="font-mono text-xs text-zenshin-navy break-all">
                      {workspaceUrl}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(workspaceUrl)}
                    className="shrink-0 p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/40 hover:text-zenshin-navy/60 transition-colors"
                    title={tc("copy")}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <Button variant="outline" onClick={handleRequestDelete}>
                <Mail className="w-4 h-4 mr-2" />
                {t("deleteRequestButton")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
