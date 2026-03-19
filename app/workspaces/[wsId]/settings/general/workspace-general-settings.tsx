"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings, AlertTriangle, Copy, Mail, Check } from "lucide-react";
import { updateWorkspaceName } from "./actions";

interface WorkspaceGeneralSettingsProps {
  wsId: string;
  workspaceName: string;
  isOwner: boolean;
  isDefaultWorkspace: boolean;
}

function CopyField({
  label,
  value,
  mono,
  copiedLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-zenshin-navy/50 mb-1 block">
        {label}
      </label>
      <div className="flex items-start gap-2">
        <div
          className={`flex-1 rounded-md border border-zenshin-navy/10 bg-zenshin-navy/[0.02] px-3 py-2 text-sm text-zenshin-navy ${mono ? "font-mono text-xs" : ""} whitespace-pre-wrap break-all`}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 mt-1 p-1.5 rounded-md text-zenshin-navy/40 hover:text-zenshin-navy/70 hover:bg-zenshin-navy/5 transition-colors"
          title={copiedLabel}
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

  const emailTo = "help@u2c.io";
  const emailSubject = t("deleteRequestSubject", { name: workspaceName });
  const emailBody = [
    `${t("deleteRequestWorkspaceName")}: ${workspaceName}`,
    `${t("deleteRequestWorkspaceId")}: ${wsId}`,
    `URL: ${workspaceUrl}`,
    "",
    `${t("deleteRequestReason")}:`,
    "",
  ].join("\n");

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

              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Mail className="w-4 h-4 mr-2" />
                {t("deleteRequestButton")}
              </Button>

              <Dialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t("deleteRequestDialogTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("deleteRequestDialogDescription")}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <CopyField
                      label={t("deleteRequestTo")}
                      value={emailTo}
                      mono
                      copiedLabel={tc("copied")}
                    />
                    <CopyField
                      label={t("deleteRequestSubjectLabel")}
                      value={emailSubject}
                      copiedLabel={tc("copied")}
                    />
                    <CopyField
                      label={t("deleteRequestBodyLabel")}
                      value={emailBody}
                      mono
                      copiedLabel={tc("copied")}
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteDialogOpen(false)}
                    >
                      {tc("close")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      )}
    </div>
  );
}
