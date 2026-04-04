/**
 * ワークスペースロール・権限ヘルパー
 * docs/MULTI-WORKSPACE-CONSULTANT-DESIGN.md に基づく
 */

export type WorkspaceRole = "owner" | "consultant" | "editor" | "viewer";

// lucide-react アイコン名（コンポーネントで使用）
export const ROLE_ICONS: Record<WorkspaceRole, string> = {
  owner: "Crown",
  consultant: "Stethoscope",
  editor: "Shield",
  viewer: "Eye",
};

/** チャート新規作成可能（owner, consultant のみ） */
export function canCreateChart(role: WorkspaceRole): boolean {
  return ["owner", "consultant"].includes(role);
}

/** V/R/T/A 編集可能 */
export function canEditContent(role: WorkspaceRole): boolean {
  return ["owner", "consultant", "editor"].includes(role);
}

/** コメント可能（全ロール可） */
export function canComment(role: WorkspaceRole): boolean {
  return true;
}

/** メンバー管理可能（owner のみ） */
export function canManageMembers(role: WorkspaceRole): boolean {
  return role === "owner";
}

/** メンバー招待可能（owner のみ。メール招待フロー用） */
export function canInviteMembers(role: WorkspaceRole): boolean {
  return role === "owner";
}

/** メンバー削除可能（owner のみ） */
export function canRemoveMembers(role: WorkspaceRole): boolean {
  return role === "owner";
}

/** 招待リンク生成可能（owner + editor。既存の invite_code フロー用） */
export function canGenerateInviteLink(role: WorkspaceRole): boolean {
  return ["owner", "editor"].includes(role);
}

/** WS設定・課金管理可能（owner のみ） */
export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "owner";
}

/** Proposal作成可能（editor以上） */
export function canCreateProposal(role: WorkspaceRole): boolean {
  return ["owner", "consultant", "editor"].includes(role);
}

/** Proposal承認・却下可能（owner/consultant のみ） */
export function canApproveProposal(role: WorkspaceRole): boolean {
  return ["owner", "consultant"].includes(role);
}
