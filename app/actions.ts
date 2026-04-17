"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ダッシュボード用データ取得
export async function getDashboardData() {
  try {
    const supabase = await createClient();

    // チャート情報とエリア情報を取得
    const { data: charts, error: chartsError } = await supabase
      .from("charts")
      .select(`
        id,
        title,
        due_date,
        created_at,
        updated_at,
        areas (
          id,
          name,
          color,
          sort_order
        )
      `)
      .order("updated_at", { ascending: false });

    if (chartsError) {
      console.error("[getDashboardData] Error fetching charts:", chartsError);
      return [];
    }

    // エリア情報を整形
    const formattedCharts = (charts || []).map((chart: { id: string; title: string; due_date: string | null; created_at: string; updated_at: string; areas: { id: string; name: string; color: string; sort_order: number }[] }) => ({
      id: chart.id,
      title: chart.title || "無題のチャート",
      due_date: chart.due_date,
      created_at: chart.created_at,
      updated_at: chart.updated_at,
      areas: (chart.areas || []).sort((a, b) => a.sort_order - b.sort_order),
    }));

    return formattedCharts;
  } catch (error) {
    console.error("[getDashboardData] Exception:", error);
    return [];
  }
}

// 新規チャート作成
export async function createChart(
  title: string = "無題のチャート"
): Promise<{ id: string; title: string }> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  // 新規チャートを作成
  const { data: newChart, error: insertError } = await supabase
    .from("charts")
    .insert({
      title,
      user_id: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[createChart] Error creating chart:", insertError);
    throw new Error(insertError.message);
  }


  // ページを再検証
  revalidatePath("/charts");

  return { id: newChart.id, title: newChart.title };
}

// チャート削除
export async function deleteChart(chartId: string): Promise<void> {
  const supabase = await createClient();

  // ユーザー確認
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("[deleteChart] Auth Error:", authError);
    throw new Error("Unauthorized");
  }

  // チャートを削除（CASCADEで関連データも削除される）
  const { error: deleteError } = await supabase
    .from("charts")
    .delete()
    .eq("id", chartId);

  if (deleteError) {
    console.error("[deleteChart] Error deleting chart:", deleteError);
    throw new Error(deleteError.message);
  }


  // ページを再検証
  revalidatePath("/charts");
}

