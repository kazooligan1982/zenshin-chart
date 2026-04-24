"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Check,
  XCircle,
  Plus,
  Pencil,
  Minus,
  Bot,
  Link2,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// --- Types ---

// Legacy VRTA-extract shape (ai_brainstorm / ai_structurize).
interface LegacyProposalItem {
  id: string;
  type: "vision" | "reality" | "tension" | "action";
  action: "add" | "update" | "remove";
  title: string;
  description?: string;
  tensionIndex?: number;
  due_date?: string | null;
  old_title?: string;
}

// Operation items (#86ex7fyrx) used by tool-sync / claude-chat / manual flows.
interface CreateActionItem {
  id: string;
  type: "create_action";
  tension_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
  status?: "todo" | "in_progress";
  external_url?: string;
}

interface UpdateActionStatusItem {
  id: string;
  type: "update_action_status";
  action_id: string;
  new_status: "todo" | "in_progress" | "done";
  note?: string;
}

interface CreateTensionItem {
  id: string;
  type: "create_tension";
  title: string;
  description?: string;
  vision_ids?: string[];
  reality_ids?: string[];
}

type ProposalItem =
  | LegacyProposalItem
  | CreateActionItem
  | UpdateActionStatusItem
  | CreateTensionItem;

const isLegacyItem = (item: ProposalItem): item is LegacyProposalItem =>
  item.type === "vision" ||
  item.type === "reality" ||
  item.type === "tension" ||
  item.type === "action";

interface StructuralDiagnosis {
  type: "advancing" | "oscillating" | "unclear";
  conflict_pattern?: string | null;
  hierarchy_selected?: boolean;
  reasoning?: string;
}

interface Proposal {
  id: string;
  chart_id: string;
  workspace_id: string;
  proposed_by: string;
  source: string;
  status: "pending" | "approved" | "rejected" | "partial";
  title: string | null;
  items: ProposalItem[];
  metadata: {
    structural_diagnosis?: StructuralDiagnosis;
    conversation_excerpt?: string;
    session_id?: string;
  } | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
}

interface ProposalsPanelProps {
  chartId: string;
  isOpen: boolean;
  onClose: () => void;
  canApprove: boolean;
  onApproved?: () => void; // callback after approval to refresh chart
}

// --- Helpers ---

const SOURCE_ICONS: Record<string, typeof Bot> = {
  ai_brainstorm: Bot,
  ai_structurize: FileText,
  ai_tool_sync: Link2,
  clickup_webhook: Link2,
  claude_chat: Bot,
  manual: Pencil,
};

const SOURCE_LABELS: Record<string, { ja: string; en: string }> = {
  ai_brainstorm: { ja: "壁打ちから抽出", en: "From brainstorm" },
  ai_structurize: { ja: "テキストから構造化", en: "Structured from text" },
  ai_tool_sync: { ja: "ツール同期", en: "Tool sync" },
  clickup_webhook: { ja: "ClickUp連携", en: "ClickUp webhook" },
  claude_chat: { ja: "Claudeチャット", en: "Claude chat" },
  manual: { ja: "手動提案", en: "Manual proposal" },
};

const TYPE_COLORS: Record<string, string> = {
  vision: "border-l-emerald-500",
  reality: "border-l-orange-500",
  tension: "border-l-sky-500",
  action: "border-l-slate-500",
};

const TYPE_LABELS: Record<string, { ja: string; en: string }> = {
  vision: { ja: "Vision", en: "Vision" },
  reality: { ja: "Reality", en: "Reality" },
  tension: { ja: "Tension", en: "Tension" },
  action: { ja: "Action", en: "Action" },
};

const ACTION_ICONS: Record<string, typeof Plus> = {
  add: Plus,
  update: Pencil,
  remove: Minus,
};

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return lang === "ja" ? "たった今" : "just now";
  if (minutes < 60)
    return lang === "ja" ? `${minutes}分前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === "ja" ? `${hours}時間前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === "ja" ? `${days}日前` : `${days}d ago`;
}

// --- Component ---

export default function ProposalsPanel({
  chartId,
  isOpen,
  onClose,
  canApprove,
  onApproved,
}: ProposalsPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _t = useTranslations();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<
    Record<string, Set<string>>
  >({});
  const [expandedProposals, setExpandedProposals] = useState<Set<string>>(
    new Set()
  );

  // Detect language from locale
  const lang = typeof window !== "undefined"
    ? (document.documentElement.lang || "ja")
    : "ja";

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/proposals/list?chartId=${chartId}&status=pending`
      );
      const data = await res.json();
      if (data.proposals) {
        setProposals(data.proposals);
        // Auto-expand all and select all items by default
        const expanded = new Set<string>();
        const selected: Record<string, Set<string>> = {};
        for (const p of data.proposals) {
          expanded.add(p.id);
          selected[p.id] = new Set(
            (p.items as ProposalItem[]).map((i) => i.id)
          );
        }
        setExpandedProposals(expanded);
        setSelectedItems(selected);
      }
    } catch {
      logger.error("Failed to fetch proposals");
    } finally {
      setLoading(false);
    }
  }, [chartId]);

  useEffect(() => {
    if (isOpen) {
      fetchProposals();
    }
  }, [isOpen, fetchProposals]);

  const toggleItem = (proposalId: string, itemId: string) => {
    setSelectedItems((prev) => {
      const current = new Set(prev[proposalId] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        current.add(itemId);
      }
      return { ...prev, [proposalId]: current };
    });
  };

  const toggleProposal = (proposalId: string) => {
    setExpandedProposals((prev) => {
      const next = new Set(prev);
      if (next.has(proposalId)) {
        next.delete(proposalId);
      } else {
        next.add(proposalId);
      }
      return next;
    });
  };

  const handleApprove = async (
    proposalId: string,
    approveAll: boolean = false
  ) => {
    setProcessingId(proposalId);
    try {
      const selected = selectedItems[proposalId];
      const body: Record<string, unknown> = {
        proposal_id: proposalId,
        action: "approve",
      };
      if (!approveAll && selected) {
        body.approved_item_ids = Array.from(selected);
      }

      const res = await fetch("/api/proposals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          lang === "ja"
            ? `${data.applied_count}件をチャートに反映しました`
            : `Applied ${data.applied_count} items to chart`
        );
        await fetchProposals();
        onApproved?.();
      } else {
        toast.error(data.error || "Failed to approve");
      }
    } catch {
      toast.error("Error approving proposal");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    setProcessingId(proposalId);
    try {
      const res = await fetch("/api/proposals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposalId,
          action: "reject",
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(lang === "ja" ? "提案を却下しました" : "Proposal rejected");
        await fetchProposals();
      } else {
        toast.error(data.error || "Failed to reject");
      }
    } catch {
      toast.error("Error rejecting proposal");
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = proposals.length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-background border-l shadow-xl",
          "transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Proposals</h2>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pendingCount}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="h-[calc(100%-57px)]">
          <div className="p-4 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && pendingCount === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {lang === "ja"
                  ? "承認待ちの提案はありません"
                  : "No pending proposals"}
              </div>
            )}

            {proposals.map((proposal) => {
              const SourceIcon =
                SOURCE_ICONS[proposal.source] || FileText;
              const sourceLabel =
                SOURCE_LABELS[proposal.source]?.[lang === "ja" ? "ja" : "en"] ||
                proposal.source;
              const isExpanded = expandedProposals.has(proposal.id);
              const isProcessing = processingId === proposal.id;
              const selected = selectedItems[proposal.id] || new Set();
              const items = proposal.items as ProposalItem[];
              const diagnosis =
                proposal.metadata?.structural_diagnosis;

              return (
                <div
                  key={proposal.id}
                  className="border rounded-lg overflow-hidden"
                >
                  {/* Proposal header */}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 text-left"
                    onClick={() => toggleProposal(proposal.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <SourceIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate flex-1">
                      {proposal.title || sourceLabel}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(proposal.created_at, lang)}
                    </span>
                  </button>

                  {/* Structural diagnosis badge */}
                  {diagnosis && (
                    <div className="px-3 pb-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          diagnosis.type === "advancing" &&
                            "border-emerald-500 text-emerald-700",
                          diagnosis.type === "oscillating" &&
                            "border-orange-500 text-orange-700",
                          diagnosis.type === "unclear" &&
                            "border-gray-400 text-gray-500"
                        )}
                      >
                        {diagnosis.type === "advancing"
                          ? lang === "ja"
                            ? "前進構造 ✅"
                            : "Advancing ✅"
                          : diagnosis.type === "oscillating"
                            ? lang === "ja"
                              ? `葛藤構造 ⚠️${diagnosis.conflict_pattern ? ` — ${diagnosis.conflict_pattern}` : ""}`
                              : `Oscillating ⚠️${diagnosis.conflict_pattern ? ` — ${diagnosis.conflict_pattern}` : ""}`
                            : lang === "ja"
                              ? "判定不能 ❓"
                              : "Unclear ❓"}
                      </Badge>
                      {diagnosis.reasoning && (
                        <p className="text-xs text-muted-foreground mt-1 pl-1">
                          {diagnosis.reasoning}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Items list */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-1.5">
                      {items.map((item) => {
                        const isChecked = selected.has(item.id);

                        // --- New operation-item shapes (#86ex7fyrx) ---
                        if (item.type === "create_action") {
                          const title = (item as CreateActionItem).title;
                          const desc = (item as CreateActionItem).description;
                          const url = (item as CreateActionItem).external_url;
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-2 pl-2 pr-1 py-1.5 rounded border-l-2 border-l-emerald-500"
                            >
                              {canApprove && (
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    toggleItem(proposal.id, item.id)
                                  }
                                  className="mt-0.5"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] h-4 px-1.5">
                                  {lang === "ja" ? "新規Action" : "New Action"}
                                </Badge>
                                <p className="text-sm mt-0.5">{title}</p>
                                {desc && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {desc}
                                  </p>
                                )}
                                {url && (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline mt-0.5"
                                  >
                                    <Link2 className="h-3 w-3" />
                                    {url}
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (item.type === "update_action_status") {
                          const u = item as UpdateActionStatusItem;
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-2 pl-2 pr-1 py-1.5 rounded border-l-2 border-l-sky-500"
                            >
                              {canApprove && (
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    toggleItem(proposal.id, item.id)
                                  }
                                  className="mt-0.5"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 text-[10px] h-4 px-1.5">
                                  {lang === "ja"
                                    ? "ステータス変更"
                                    : "Status change"}
                                </Badge>
                                <p className="text-sm mt-0.5">
                                  → {u.new_status}
                                </p>
                                {u.note && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {u.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (item.type === "create_tension") {
                          const tItem = item as CreateTensionItem;
                          const linkCount =
                            (tItem.vision_ids?.length ?? 0) +
                            (tItem.reality_ids?.length ?? 0);
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-2 pl-2 pr-1 py-1.5 rounded border-l-2 border-l-orange-500"
                            >
                              {canApprove && (
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    toggleItem(proposal.id, item.id)
                                  }
                                  className="mt-0.5"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-[10px] h-4 px-1.5">
                                  {lang === "ja"
                                    ? "新規Tension"
                                    : "New Tension"}
                                </Badge>
                                <p className="text-sm mt-0.5">{tItem.title}</p>
                                {tItem.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {tItem.description}
                                  </p>
                                )}
                                {linkCount > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {lang === "ja"
                                      ? `V×${tItem.vision_ids?.length ?? 0} / R×${tItem.reality_ids?.length ?? 0} にリンク`
                                      : `links V×${tItem.vision_ids?.length ?? 0} / R×${tItem.reality_ids?.length ?? 0}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // --- Legacy VRTA-extract shape ---
                        if (!isLegacyItem(item)) return null;
                        const ActionIcon =
                          ACTION_ICONS[item.action] || Plus;
                        const typeColor =
                          TYPE_COLORS[item.type] || "border-l-gray-300";
                        const typeLabel =
                          TYPE_LABELS[item.type]?.[
                            lang === "ja" ? "ja" : "en"
                          ] || item.type;

                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "flex items-start gap-2 pl-2 pr-1 py-1.5 rounded border-l-2",
                              typeColor,
                              item.action === "remove" && "opacity-60"
                            )}
                          >
                            {canApprove && (
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() =>
                                  toggleItem(proposal.id, item.id)
                                }
                                className="mt-0.5"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <ActionIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {typeLabel}
                                </span>
                              </div>
                              <p
                                className={cn(
                                  "text-sm mt-0.5",
                                  item.action === "remove" &&
                                    "line-through text-muted-foreground"
                                )}
                              >
                                {item.title}
                              </p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {item.description}
                                </p>
                              )}
                              {item.action === "update" &&
                                item.old_title && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-through">
                                    {item.old_title}
                                  </p>
                                )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Action buttons */}
                      {canApprove && (
                        <div className="flex items-center gap-2 pt-2 border-t mt-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1"
                            disabled={isProcessing}
                            onClick={() =>
                              handleApprove(proposal.id, true)
                            }
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Check className="h-3 w-3 mr-1" />
                            )}
                            {lang === "ja"
                              ? "全部取り込み"
                              : "Approve all"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              isProcessing || selected.size === 0
                            }
                            onClick={() =>
                              handleApprove(proposal.id, false)
                            }
                          >
                            {lang === "ja"
                              ? `選択承認 (${selected.size})`
                              : `Approve (${selected.size})`}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProcessing}
                            onClick={() => handleReject(proposal.id)}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            {lang === "ja" ? "却下" : "Reject"}
                          </Button>
                        </div>
                      )}

                      {!canApprove && (
                        <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
                          {lang === "ja"
                            ? "承認権限がありません（Owner/Consultantのみ）"
                            : "No approval permission (Owner/Consultant only)"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
