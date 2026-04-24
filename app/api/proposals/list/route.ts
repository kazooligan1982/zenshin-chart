import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chartId = req.nextUrl.searchParams.get("chartId");
  const status = req.nextUrl.searchParams.get("status"); // optional filter
  // Source filter: "ai_brainstorm" | "ai_structurize" | "ai_tool_sync"
  //                | "claude_chat" | "clickup_webhook" | "manual"
  // Accepts a single value or a comma-separated list.
  const sourceParam = req.nextUrl.searchParams.get("source");

  if (!chartId) {
    return NextResponse.json(
      { error: "chartId is required" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("chart_proposals")
    .select("*")
    .eq("chart_id", chartId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (sourceParam) {
    const sources = sourceParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (sources.length === 1) {
      query = query.eq("source", sources[0]);
    } else if (sources.length > 1) {
      query = query.in("source", sources);
    }
  }

  const { data: proposals, error } = await query;

  if (error) {
    logger.error("[proposals/list] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch proposals" },
      { status: 500 }
    );
  }

  return NextResponse.json({ proposals: proposals || [] });
}
