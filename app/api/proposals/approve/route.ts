import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Proposal items support two shapes:
 *
 * (1) Legacy VRTA-extract shape used by ai_brainstorm/ai_structurize flows:
 *     { type: "vision" | "reality" | "tension" | "action", action: "add" | "update" | "remove", ... }
 *
 * (2) Operation shape (#86ex7fyrx) used by ai_tool_sync / claude_chat / manual flows
 *     for targeted edits against an existing chart:
 *     { type: "create_action", tension_id, title, description?, due_date?, status?, external_url? }
 *     { type: "update_action_status", action_id, new_status, note? }
 *     { type: "create_tension", title, vision_ids?, reality_ids? }
 *
 * Both shapes can coexist in a single proposal's items array.
 */
interface LegacyProposalItem {
  id: string;
  type: "vision" | "reality" | "tension" | "action";
  action: "add" | "update" | "remove";
  title: string;
  description?: string;
  tensionIndex?: number;
  due_date?: string | null;
}

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

const isLegacy = (item: ProposalItem): item is LegacyProposalItem =>
  item.type === "vision" ||
  item.type === "reality" ||
  item.type === "tension" ||
  item.type === "action";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { proposal_id, approved_item_ids, action } = await req.json();

  if (!proposal_id || !action) {
    return NextResponse.json(
      { error: "proposal_id and action are required" },
      { status: 400 }
    );
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 }
    );
  }

  // Fetch the proposal
  const { data: proposal, error: fetchError } = await supabase
    .from("chart_proposals")
    .select("*")
    .eq("id", proposal_id)
    .single();

  if (fetchError || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: "Proposal has already been processed" },
      { status: 400 }
    );
  }

  // Check permission: user must be owner or consultant in the workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", proposal.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (
    !membership ||
    !["owner", "consultant"].includes(membership.role)
  ) {
    return NextResponse.json(
      { error: "Only owner or consultant can approve/reject proposals" },
      { status: 403 }
    );
  }

  // --- Reject: just update status ---
  if (action === "reject") {
    const { error: updateError } = await supabase
      .from("chart_proposals")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", proposal_id);

    if (updateError) {
      logger.error("[proposals/approve] reject error", updateError);
      return NextResponse.json(
        { error: "Failed to reject proposal" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: "rejected" });
  }

  // --- Approve: insert/update items ---
  const items = (proposal.items || []) as ProposalItem[];
  const approvedIds = approved_item_ids as string[] | undefined;

  // Determine which items to apply
  const itemsToApply = approvedIds
    ? items.filter((item) => approvedIds.includes(item.id))
    : items; // If no specific IDs provided, approve all

  const isPartial =
    approvedIds && approvedIds.length > 0 && approvedIds.length < items.length;

  const chartId = proposal.chart_id;

  // Build full content from title + description (legacy path)
  const buildContent = (item: LegacyProposalItem): string => {
    if (item.description && item.description.trim()) {
      return item.description.trim();
    }
    return item.title;
  };

  // ========= Legacy VRTA-extract items =========

  const legacyItems = itemsToApply.filter(isLegacy);

  // Insert visions
  const visionItems = legacyItems.filter(
    (i) => i.type === "vision" && i.action === "add"
  );
  if (visionItems.length > 0) {
    const { error } = await supabase.from("visions").insert(
      visionItems.map((v, idx) => ({
        chart_id: chartId,
        content: buildContent(v),
        sort_order: idx,
      }))
    );
    if (error) {
      logger.error("[proposals/approve] visions insert error", error);
    }
  }

  // Insert realities
  const realityItems = legacyItems.filter(
    (i) => i.type === "reality" && i.action === "add"
  );
  if (realityItems.length > 0) {
    const { error } = await supabase.from("realities").insert(
      realityItems.map((r, idx) => ({
        chart_id: chartId,
        content: buildContent(r),
        sort_order: idx,
      }))
    );
    if (error) {
      logger.error("[proposals/approve] realities insert error", error);
    }
  }

  // Insert tensions (need IDs for action linking via tensionIndex)
  const tensionItems = legacyItems.filter(
    (i) => i.type === "tension" && i.action === "add"
  );
  const tensionIds: string[] = [];
  for (const t of tensionItems) {
    const { data: inserted, error } = await supabase
      .from("tensions")
      .insert({
        chart_id: chartId,
        title: buildContent(t),
        status: "active",
      })
      .select("id")
      .single();
    if (error) {
      logger.error("[proposals/approve] tension insert error", error);
      continue;
    }
    if (inserted) {
      tensionIds.push(inserted.id);
    }
  }

  // Insert actions (legacy)
  const actionItems = legacyItems.filter(
    (i) => i.type === "action" && i.action === "add"
  );
  if (actionItems.length > 0) {
    const { error } = await supabase.from("actions").insert(
      actionItems.map((a) => ({
        chart_id: chartId,
        title: buildContent(a),
        tension_id:
          a.tensionIndex != null && tensionIds[a.tensionIndex]
            ? tensionIds[a.tensionIndex]
            : null,
      }))
    );
    if (error) {
      logger.error("[proposals/approve] actions insert error", error);
    }
  }

  // ========= New operation items (#86ex7fyrx) =========

  // create_tension — insert into tensions + optional tension_visions / tension_realities link rows
  const createTensionItems = itemsToApply.filter(
    (i): i is CreateTensionItem => i.type === "create_tension"
  );
  for (const t of createTensionItems) {
    const { data: inserted, error } = await supabase
      .from("tensions")
      .insert({
        chart_id: chartId,
        title: t.title,
        description: t.description ?? null,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      logger.error("[proposals/approve] create_tension insert error", error);
      continue;
    }
    const newTensionId = inserted.id;

    if (t.vision_ids && t.vision_ids.length > 0) {
      const { error: linkError } = await supabase.from("tension_visions").insert(
        t.vision_ids.map((visionId) => ({
          tension_id: newTensionId,
          vision_id: visionId,
        }))
      );
      if (linkError) {
        logger.error(
          "[proposals/approve] tension_visions insert error",
          linkError
        );
      }
    }
    if (t.reality_ids && t.reality_ids.length > 0) {
      const { error: linkError } = await supabase.from("tension_realities").insert(
        t.reality_ids.map((realityId) => ({
          tension_id: newTensionId,
          reality_id: realityId,
        }))
      );
      if (linkError) {
        logger.error(
          "[proposals/approve] tension_realities insert error",
          linkError
        );
      }
    }
  }

  // create_action — insert into actions + optional item_links row for external_url
  const createActionItems = itemsToApply.filter(
    (i): i is CreateActionItem => i.type === "create_action"
  );
  for (const a of createActionItems) {
    const { data: inserted, error } = await supabase
      .from("actions")
      .insert({
        chart_id: chartId,
        tension_id: a.tension_id,
        title: a.title,
        description: a.description ?? null,
        due_date: a.due_date ?? null,
        status: a.status ?? "todo",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      logger.error("[proposals/approve] create_action insert error", error);
      continue;
    }

    if (a.external_url && a.external_url.trim()) {
      const { error: linkError } = await supabase.from("item_links").insert({
        chart_id: chartId,
        item_type: "action",
        item_id: inserted.id,
        url: a.external_url.trim(),
        title: a.title,
        created_by: user.id,
      });
      if (linkError) {
        logger.error(
          "[proposals/approve] item_links insert error",
          linkError
        );
      }
    }
  }

  // update_action_status — update actions.status (+ is_completed when done)
  const updateActionStatusItems = itemsToApply.filter(
    (i): i is UpdateActionStatusItem => i.type === "update_action_status"
  );
  for (const u of updateActionStatusItems) {
    const patch: Record<string, unknown> = { status: u.new_status };
    if (u.new_status === "done") patch.is_completed = true;
    if (u.new_status === "todo" || u.new_status === "in_progress") {
      patch.is_completed = false;
    }
    const { error } = await supabase
      .from("actions")
      .update(patch)
      .eq("id", u.action_id);
    if (error) {
      logger.error(
        "[proposals/approve] update_action_status error",
        error
      );
    }
  }

  // Update proposal status
  const newStatus = isPartial ? "partial" : "approved";
  const { error: updateError } = await supabase
    .from("chart_proposals")
    .update({
      status: newStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", proposal_id);

  if (updateError) {
    logger.error("[proposals/approve] status update error", updateError);
  }

  return NextResponse.json({
    success: true,
    status: newStatus,
    applied_count: itemsToApply.length,
  });
}
