import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export interface ChartHistoryEntry {
  id: string;
  created_at: string;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  old_value_display?: string | null;
  new_value_display?: string | null;
  user_id: string | null;
  changed_by_name: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chartId } = await params;
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const limit = parseInt(searchParams.get("limit") ?? "5", 10);

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 }
    );
  }

  if (!["vision", "reality", "action"].includes(entityType)) {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("chart_history")
      .select("id, created_at, event_type, field, old_value, new_value, user_id")
      .eq("chart_id", chartId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100));

    if (error) {
      logger.error("[chart_history] fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);
      for (const p of profiles ?? []) {
        const profile = p as { name?: string; email?: string };
        nameMap[p.id] = profile.name ?? profile.email ?? p.id;
      }
    }

    const areaIds = [
      ...new Set(
        (rows ?? [])
          .filter((r) => r.field === "areaId" || r.field === "area_id")
          .flatMap((r) => [r.old_value, r.new_value].filter(Boolean))
      ),
    ] as string[];

    const areaNameMap: Record<string, string> = {};
    if (areaIds.length > 0) {
      const { data: areaRows } = await supabase
        .from("areas")
        .select("id, name")
        .eq("chart_id", chartId)
        .in("id", areaIds);
      for (const a of areaRows ?? []) {
        areaNameMap[a.id] = (a as { name?: string }).name ?? a.id;
      }
    }

    const data = (rows ?? []).map((r) => {
      const isAreaField = r.field === "areaId" || r.field === "area_id";
      return {
        ...r,
        changed_by_name: r.user_id ? (nameMap[r.user_id] ?? null) : null,
        old_value_display: isAreaField && r.old_value
          ? (areaNameMap[r.old_value] ?? r.old_value)
          : r.old_value,
        new_value_display: isAreaField && r.new_value
          ? (areaNameMap[r.new_value] ?? r.new_value)
          : r.new_value,
      };
    });

    return NextResponse.json(data as ChartHistoryEntry[]);
  } catch (e) {
    logger.error("[chart_history] Exception:", e);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
