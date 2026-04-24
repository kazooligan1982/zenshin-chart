import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// すべてのチャートを取得（プロジェクト一覧用）
export async function getAllCharts() {
  if (!supabase) {
    logger.warn("[getAllCharts] Supabase client not initialized", {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("charts")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      logger.error("[getAllCharts] Error fetching charts", error);

      if (error.code === "PGRST116") {
        logger.error("[getAllCharts] Table 'charts' not found. Run supabase/schema.sql");
      } else if (error.code === "42501") {
        logger.error("[getAllCharts] Permission denied. Check RLS policy");
      } else if (error.code === "PGRST301") {
        logger.error("[getAllCharts] Request rejected. Check API key");
      }

      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("[getAllCharts] Unexpected error", error);
    return [];
  }
}
