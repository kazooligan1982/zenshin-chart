import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface ProposalItem {
  id: string;
  type: string;   // "vision" | "reality" | "tension" | "action"
  action: string;  // "add" | "update" | "remove"
  title: string;
  description?: string;
  tensionIndex?: number;
  due_date?: string | null;
}

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
      console.error("[proposals/approve] reject error:", updateError);
      return NextResponse.json(
        { error: "Failed to reject proposal" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: "rejected" });
  }

  // --- Approve: insert approved items into V/R/T/A tables ---
  const items = (proposal.items || []) as ProposalItem[];
  const approvedIds = approved_item_ids as string[] | undefined;

  // Determine which items to apply
  const itemsToApply = approvedIds
    ? items.filter((item) => approvedIds.includes(item.id))
    : items; // If no specific IDs provided, approve all

  const isPartial =
    approvedIds && approvedIds.length > 0 && approvedIds.length < items.length;

  const chartId = proposal.chart_id;

  // Insert visions
  const visionItems = itemsToApply.filter(
    (i) => i.type === "vision" && i.action === "add"
  );
  if (visionItems.length > 0) {
    const { error } = await supabase.from("visions").insert(
      visionItems.map((v, idx) => ({
        chart_id: chartId,
        content: v.title,
        sort_order: idx,
      }))
    );
    if (error) {
      console.error("[proposals/approve] visions insert error:", error);
    }
  }

  // Insert realities
  const realityItems = itemsToApply.filter(
    (i) => i.type === "reality" && i.action === "add"
  );
  if (realityItems.length > 0) {
    const { error } = await supabase.from("realities").insert(
      realityItems.map((r, idx) => ({
        chart_id: chartId,
        content: r.title,
        sort_order: idx,
      }))
    );
    if (error) {
      console.error("[proposals/approve] realities insert error:", error);
    }
  }

  // Insert tensions (need IDs for action linking)
  const tensionItems = itemsToApply.filter(
    (i) => i.type === "tension" && i.action === "add"
  );
  const tensionIds: string[] = [];
  for (const t of tensionItems) {
    const { data: inserted, error } = await supabase
      .from("tensions")
      .insert({
        chart_id: chartId,
        title: t.title,
        status: "active",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[proposals/approve] tension insert error:", error);
      continue;
    }
    if (inserted) {
      tensionIds.push(inserted.id);
    }
  }

  // Insert actions
  const actionItems = itemsToApply.filter(
    (i) => i.type === "action" && i.action === "add"
  );
  if (actionItems.length > 0) {
    const { error } = await supabase.from("actions").insert(
      actionItems.map((a) => ({
        chart_id: chartId,
        title: a.title,
        tension_id:
          a.tensionIndex != null && tensionIds[a.tensionIndex]
            ? tensionIds[a.tensionIndex]
            : null,
      }))
    );
    if (error) {
      console.error("[proposals/approve] actions insert error:", error);
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
    console.error("[proposals/approve] status update error:", updateError);
  }

  return NextResponse.json({
    success: true,
    status: newStatus,
    applied_count: itemsToApply.length,
  });
}
