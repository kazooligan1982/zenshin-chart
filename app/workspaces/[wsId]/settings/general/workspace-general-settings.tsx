"use client";

import { useState } from "react";
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
}

export function WorkspaceGeneralSettings({
  wsId,
  workspaceName,
  isOwner,
}: WorkspaceGeneralSettingsProps) {
  const t = useTranslations("workspaceSettings");
  const tc = useTranslations("common");

  const [name, setName] = useState(workspaceName);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${wsId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      // Create a new workspace and navigate directly to it,
      // bypassing the /charts redirect chain which causes React Router issues
      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "マイワークスペース" }),
      });
      if (createRes.ok) {
        const newWs = await createRes.json();
        window.location.href = `/workspaces/${newWs.id}/charts`;
      } else {
        window.location.href = "/";
      }
    } catch {
      toast.error(t("deleteFailed"));
      setIsDeleting(false);
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
          <p className="text-sm text-red-600/80 mb-4">
            {t("deleteDescription")}
          </p>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            {t("deleteButton")}
          </Button>
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
              onClick={() => setDeleteConfirmName("")}
              disabled={isDeleting}
            >
              {tc("cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || isDeleting}
            >
              {isDeleting ? tc("deleting") : t("deleteConfirmButton")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
