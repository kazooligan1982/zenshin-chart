"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateWorkspaceName, deleteWorkspace } from "./actions";

type Props = {
  wsId: string;
  workspaceName: string;
  isOwner: boolean;
  isDefaultWorkspace?: boolean;
};

export function WorkspaceGeneralSettings({
  wsId,
  workspaceName,
  isOwner,
  isDefaultWorkspace = false,
}: Props) {
  const t = useTranslations("workspaceSettings");
  const router = useRouter();
  const [name, setName] = useState(workspaceName);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const nameChanged = name.trim() !== workspaceName;

  async function handleRename() {
    if (!nameChanged || !name.trim()) return;
    setIsRenaming(true);
    try {
      await updateWorkspaceName(wsId, name);
      toast.success(t("renameSuccess"));
      router.refresh();
    } catch {
      toast.error(t("renameFailed"));
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteWorkspace(wsId);
      router.push("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(`${t("deleteFailed")}${msg ? `: ${msg}` : ""}`, { duration: 10000 });
      setIsDeleting(false);
    }
  }

  if (!isOwner) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-7 h-7 text-zenshin-navy/40" />
          <div>
            <h1 className="text-2xl font-bold text-zenshin-navy">
              {t("title")}
            </h1>
            <p className="text-sm text-zenshin-navy/40">{t("description")}</p>
          </div>
        </div>
        <p className="text-sm text-zenshin-navy/60">{t("ownerOnly")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-7 h-7 text-zenshin-navy/40" />
        <div>
          <h1 className="text-2xl font-bold text-zenshin-navy">
            {t("title")}
          </h1>
          <p className="text-sm text-zenshin-navy/40">{t("description")}</p>
        </div>
      </div>

      {/* Workspace Name */}
      <div className="mb-12">
        <h2 className="text-sm font-medium text-zenshin-navy mb-1">
          {t("workspaceName")}
        </h2>
        <p className="text-xs text-zenshin-navy/40 mb-3">
          {isDefaultWorkspace ? t("defaultWorkspaceNote") : t("workspaceNameDescription")}
        </p>
        {!isDefaultWorkspace && (
          <div className="flex gap-3 max-w-md">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
              maxLength={100}
            />
            <Button
              onClick={handleRename}
              disabled={!nameChanged || isRenaming || !name.trim()}
              size="sm"
            >
              {isRenaming ? t("renaming") : t("rename")}
            </Button>
          </div>
        )}
        {isDefaultWorkspace && (
          <div className="text-sm text-zenshin-navy/50 bg-zenshin-navy/[0.03] rounded-md px-4 py-3 max-w-md">
            {workspaceName}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      {isDefaultWorkspace ? null : (
      <div className="border border-red-200 rounded-lg p-6">
        <h2 className="text-sm font-medium text-red-600 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4" />
          {t("dangerZone")}
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zenshin-navy">
              {t("deleteWorkspace")}
            </h3>
            <p className="text-xs text-zenshin-navy/40 mt-0.5">
              {t("deleteWorkspaceDescription")}
            </p>
          </div>

          <AlertDialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setConfirmName("");
          }}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                {t("deleteButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteConfirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <label className="text-sm text-zenshin-navy/70 block mb-2">
                  {t("deleteConfirmLabel")}
                </label>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={workspaceName}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={confirmName !== workspaceName || isDeleting}
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                >
                  {isDeleting ? t("deleting") : t("deleteConfirmButton")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      )}
    </div>
  );
}
