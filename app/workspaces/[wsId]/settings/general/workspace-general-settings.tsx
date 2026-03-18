"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Settings, AlertTriangle } from "lucide-react";
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  // Use a ref instead of useState for isDeleting to avoid triggering a
  // React re-render. Re-rendering the component tree (including the
  // Next.js Router) can trigger a React 19 core bug (facebook/react#33580)
  // where conditional use(thenable) in the Router's useActionQueue causes
  // "Rendered more hooks than during the previous render".
  const isDeletingRef = useRef(false);

  const hasNameChanged = name.trim() !== workspaceName;
  const canDelete = deleteConfirmName.trim() === workspaceName;

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

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canDelete || isDeletingRef.current) return;
    isDeletingRef.current = true;

    // Update button state via DOM to avoid React re-render.
    // Any setState here would re-render the entire tree including the
    // Next.js Router, which can trigger the React 19 hooks bug.
    const button = e.currentTarget;
    const cancelButton = button.parentElement?.querySelector(
      "[data-cancel-button]"
    ) as HTMLButtonElement | null;
    button.disabled = true;
    button.textContent = tc("deleting");
    if (cancelButton) cancelButton.disabled = true;

    try {
      const res = await fetch(`/api/workspaces/${wsId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      const data = await res.json();
      // Full page reload to completely bypass the Next.js Router.
      window.location.href = data.redirectTo || "/charts";
    } catch {
      toast.error(t("deleteFailed"));
      isDeletingRef.current = false;
      button.disabled = false;
      button.textContent = t("deleteConfirmButton");
      if (cancelButton) cancelButton.disabled = false;
    }
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

      {/* Danger Zone */}
      {isOwner && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold text-red-700">{t("dangerZone")}</h3>
          </div>
          {isDefaultWorkspace ? (
            <p className="text-sm text-zenshin-navy/60">
              {t("cannotDeleteDefault")}
            </p>
          ) : (
            <>
              <p className="text-sm text-red-600/80 mb-4">
                {t("deleteDescription")}
              </p>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                {t("deleteButton")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700">
              {t("deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                {t("deleteConfirmMessage", { name: workspaceName })}
              </span>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={t("deleteConfirmPlaceholder")}
                className="mt-2"
                autoComplete="off"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              data-cancel-button
              onClick={() => setDeleteConfirmName("")}
            >
              {tc("cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete}
            >
              {t("deleteConfirmButton")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
