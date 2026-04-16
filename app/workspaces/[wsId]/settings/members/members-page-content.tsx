"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Crown, User, X, Loader2, Shield, Eye, Stethoscope, Mail } from "lucide-react";
import {
  createInvitation,
  removeMember,
} from "@/lib/workspace";
import { inviteMember, revokeInvitation, getPendingInvitations } from "./actions";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canGenerateInviteLink, canInviteMembers, canRemoveMembers } from "@/lib/permissions";

interface Member {
  id: string;
  email: string;
  name?: string;
  role: string;
  avatar_url?: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface MembersPageContentProps {
  workspaceId: string;
  currentUserId: string;
  currentRole: string;
  initialMembers: Member[];
  initialPendingInvitations?: PendingInvitation[];
}

export function MembersPageContent({
  workspaceId,
  currentUserId,
  currentRole,
  initialMembers,
  initialPendingInvitations = [],
}: MembersPageContentProps) {
  const tMembers = useTranslations("members");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>(initialPendingInvitations);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    setIsGenerating(true);

    const result = await createInvitation(workspaceId);
    if (result) {
      setInviteUrl(result.url);
      toast.success(tt("inviteLinkGenerated"), { duration: 3000 });
    } else {
      toast.error(tt("inviteLinkFailed"), { duration: 5000 });
    }
    setIsGenerating(false);
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setIsCopied(true);
    toast.success(tt("copied"), { duration: 3000 });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRemoveMember = async () => {
    const member = memberToRemove;
    if (!workspaceId || !member) return;
    setMemberToRemove(null);
    setRemovingId(member.id);
    const result = await removeMember(workspaceId, member.id);

    if (result.success) {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      toast.success(tt("memberRemoved"), { duration: 3000 });
    } else {
      toast.error(tt(result.error ?? "deleteFailed"), { duration: 5000 });
    }
    setRemovingId(null);
  };

  const canShowInviteLink = canGenerateInviteLink(currentRole as "owner" | "consultant" | "editor" | "viewer");
  const canShowEmailInvite = canInviteMembers(currentRole as "owner" | "consultant" | "editor" | "viewer");
  const canRemove = canRemoveMembers(currentRole as "owner" | "consultant" | "editor" | "viewer");

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsSendingInvite(true);
    try {
      await inviteMember(workspaceId, inviteEmail.trim(), inviteRole);
      toast.success(tt("inviteEmailSent"), { duration: 3000 });
      setInviteEmail("");
      const updated = await getPendingInvitations(workspaceId);
      setPendingInvitations(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tt("inviteSendFailed"), { duration: 5000 });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    setRevokingId(invitationId);
    try {
      await revokeInvitation(workspaceId, invitationId);
      toast.success(tt("inviteRevoked"), { duration: 3000 });
      const updated = await getPendingInvitations(workspaceId);
      setPendingInvitations(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tt("inviteRevokeFailed"), { duration: 5000 });
    } finally {
      setRevokingId(null);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === "owner") return <Crown className="w-4 h-4 shrink-0 text-amber-500" />;
    if (role === "consultant") return <Stethoscope className="w-4 h-4 shrink-0 text-violet-500" />;
    if (role === "editor") return <Shield className="w-4 h-4 shrink-0 text-zenshin-teal" />;
    if (role === "viewer") return <Eye className="w-4 h-4 shrink-0 text-gray-400" />;
    return <User className="w-4 h-4 shrink-0 text-gray-400" />;
  };

  const getRoleLabel = (role: string) => {
    const key = role as "owner" | "consultant" | "editor" | "viewer";
    if (["owner", "consultant", "editor", "viewer"].includes(role)) {
      return tMembers(`role.${key}`);
    }
    return tMembers("role.member");
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="flex items-center gap-3 mb-8">
        <Users className="w-7 h-7 text-zenshin-navy/40" />
        <h1 className="text-2xl font-bold text-zenshin-navy">{tMembers("title")}</h1>
      </div>

      {/* メールで招待（ownerのみ） */}
      {canShowEmailInvite && (
        <div className="bg-white rounded-2xl border border-zenshin-navy/8 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zenshin-navy mb-1 flex items-center gap-2">
            <Mail className="h-5 w-5 text-zenshin-navy/40" />
            {tMembers("inviteByEmailTitle")}
          </h2>
          <p className="text-sm text-zenshin-navy/40 mb-4">
            {tMembers("inviteByEmailDesc")}
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <Input
                type="email"
                placeholder="example@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="border-zenshin-navy/10"
              />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="min-w-[160px] border-zenshin-navy/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consultant">{tMembers("role.consultant")}</SelectItem>
                <SelectItem value="editor">{tMembers("role.editor")}</SelectItem>
                <SelectItem value="viewer">{tMembers("role.viewer")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleSendInvite}
              disabled={!inviteEmail.trim() || isSendingInvite}
              className="bg-zenshin-orange hover:bg-zenshin-orange/90 text-white"
            >
              {isSendingInvite ? tMembers("sending") : tMembers("sendInvite")}
            </Button>
          </div>
        </div>
      )}

      {/* 招待リンク */}
      {canShowInviteLink && (
        <div className="bg-white rounded-2xl border border-zenshin-navy/8 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zenshin-navy mb-1">{tMembers("inviteLinkTitle")}</h2>
          <p className="text-sm text-zenshin-navy/40 mb-4">
            {tMembers("inviteLinkDesc")}
          </p>
          {inviteUrl ? (
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="font-mono text-sm border-zenshin-navy/10" />
              <Button onClick={handleCopy} variant="outline" size="icon" className="border-zenshin-navy/10 hover:bg-zenshin-cream">
                {isCopied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4 text-zenshin-navy/40" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleGenerateLink}
              disabled={isGenerating}
              className="bg-zenshin-orange hover:bg-zenshin-orange/90 text-white"
            >
              {isGenerating ? tMembers("generating") : tMembers("inviteLink")}
            </Button>
          )}
        </div>
      )}

      {/* 保留中の招待 */}
      {canShowEmailInvite && pendingInvitations.length > 0 && (
        <div className="bg-white rounded-2xl border border-zenshin-navy/8 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zenshin-navy mb-4">{tMembers("pendingInvites")}</h2>
          <div className="space-y-2">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-zenshin-cream/50"
              >
                <div>
                  <span className="font-medium text-zenshin-navy">{inv.email}</span>
                  <span className="text-sm text-zenshin-navy/40 ml-2">
                    （{getRoleLabel(inv.role)}）
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeInvitation(inv.id)}
                  disabled={revokingId === inv.id}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8"
                >
                  {revokingId === inv.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    tMembers("revoke")
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* メンバー一覧 */}
      <div className="bg-white rounded-2xl border border-zenshin-navy/8 p-6">
        <h2 className="text-lg font-semibold text-zenshin-navy flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-zenshin-navy/40" />
          {tMembers("memberList")}（{tMembers("memberCount", { count: members.length })}）
        </h2>
        <div className="space-y-1">
          {members.map((member) => {
            const isOwner = member.role === "owner";
            const isSelf = member.id === currentUserId;
            const showDeleteButton = canRemove && !isOwner && !isSelf;

            return (
              <div
                key={member.id}
                className="group flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-zenshin-navy/8 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-zenshin-navy/30" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-zenshin-navy truncate">
                      {member.name || member.email}
                    </p>
                    {member.name && (
                      <p className="text-sm text-zenshin-navy/40 truncate">
                        {member.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 w-[200px] justify-end shrink-0">
                  <div className="flex items-center gap-2">
                    {getRoleIcon(member.role)}
                    <span className="text-sm whitespace-nowrap text-zenshin-navy/60">
                      {getRoleLabel(member.role)}
                    </span>
                  </div>
                  <div className="w-8 flex items-center justify-end shrink-0">
                    {showDeleteButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMemberToRemove(member)}
                        disabled={removingId === member.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0 shrink-0"
                      >
                        {removingId === member.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* メンバー削除確認ダイアログ */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent className="rounded-2xl border-gray-200 shadow-xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-zenshin-navy">
              {tMembers("removeConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              {tMembers("removeConfirmDesc", { name: (memberToRemove?.name || memberToRemove?.email) ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg px-4 py-2 text-sm">
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600"
              onClick={handleRemoveMember}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
