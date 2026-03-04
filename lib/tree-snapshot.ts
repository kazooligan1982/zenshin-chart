/**
 * Tree Snapshot: マスターチャートと配下全チャートのデータを一括収集・保存するロジック
 * Cronジョブ等から service_role クライアントで使用する
 */

export interface TreeSnapshotChartData {
  chart_id: string;
  title: string;
  depth: number;
  role: "master" | "child";
  parent_chart_id: string | null;
  visions: any[];
  realities: any[];
  tensions: any[];
  actions: any[];
}

export interface TreeSnapshotData {
  tree_meta: {
    master_chart_id: string;
    captured_at: string;
    total_charts: number;
  };
  charts: TreeSnapshotChartData[];
  summary: {
    total_visions: number;
    total_realities: number;
    total_tensions: number;
    total_actions: number;
    per_chart: Array<{
      chart_id: string;
      title: string;
      v: number;
      r: number;
      t: number;
      a: number;
    }>;
  };
}

type SupabaseClient = any;

/**
 * childToParentChartMap を構築（getChartsHierarchy と同じロジック）
 */
async function buildChildToParentMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data: actions } = await supabase
    .from("actions")
    .select("id, chart_id, child_chart_id");

  const map = new Map<string, string>();
  for (const action of actions || []) {
    if (action.child_chart_id && action.chart_id) {
      map.set(action.child_chart_id, action.chart_id);
    }
  }
  return map;
}

/**
 * depth を再帰的に計算（getChartsHierarchy と同じロジック）
 */
function getChartDepth(
  chartId: string,
  childToParentChartMap: Map<string, string>,
  visited = new Set<string>()
): number {
  if (visited.has(chartId)) return 1;
  visited.add(chartId);
  const parentChartId = childToParentChartMap.get(chartId);
  if (!parentChartId) return 1;
  return 1 + getChartDepth(parentChartId, childToParentChartMap, visited);
}

/**
 * マスターチャート配下の全チャートIDを取得（マスター含む）
 */
function getDescendantChartIds(
  masterChartId: string,
  allChartIdsInWorkspace: string[],
  childToParentChartMap: Map<string, string>
): string[] {
  const result: string[] = [masterChartId];
  const findDescendants = (parentId: string) => {
    for (const chartId of allChartIdsInWorkspace) {
      const parentChartId = childToParentChartMap.get(chartId);
      if (parentChartId === parentId && !result.includes(chartId)) {
        result.push(chartId);
        findDescendants(chartId);
      }
    }
  };
  findDescendants(masterChartId);
  return result;
}

/**
 * 単一チャートの VRTA データを取得
 */
async function fetchChartVrtaData(
  chartId: string,
  supabase: SupabaseClient
): Promise<{ visions: any[]; realities: any[]; tensions: any[]; actions: any[] }> {
  try {
    const [visionsRes, realitiesRes, tensionsRes, actionsRes] = await Promise.all([
      supabase.from("visions").select("*").eq("chart_id", chartId),
      supabase.from("realities").select("*").eq("chart_id", chartId),
      supabase.from("tensions").select("*").eq("chart_id", chartId),
      supabase.from("actions").select("*").eq("chart_id", chartId),
    ]);

    return {
      visions: visionsRes.data || [],
      realities: realitiesRes.data || [],
      tensions: tensionsRes.data || [],
      actions: actionsRes.data || [],
    };
  } catch (err) {
    console.error(`[collectTreeSnapshotData] Error fetching chart ${chartId}:`, err);
    return { visions: [], realities: [], tensions: [], actions: [] };
  }
}

/**
 * マスターチャートと配下全チャートのデータを一括収集
 */
export async function collectTreeSnapshotData(
  masterChartId: string,
  workspaceId: string | null,
  supabaseClient: SupabaseClient
): Promise<TreeSnapshotData> {
  const capturedAt = new Date().toISOString();

  // 1. マスターチャートの情報を取得
  const { data: masterChart, error: masterError } = await supabaseClient
    .from("charts")
    .select("id, title")
    .eq("id", masterChartId)
    .single();

  if (masterError || !masterChart) {
    throw new Error(`Master chart not found: ${masterChartId}`);
  }

  // 2. childToParentChartMap を構築
  const childToParentChartMap = await buildChildToParentMap(supabaseClient);

  // 3. 同じ workspace_id の全チャートを取得（workspaceId が null の場合は workspace_id IS NULL）
  const workspaceQuery = supabaseClient
    .from("charts")
    .select("id")
    .is("archived_at", null);
  const { data: workspaceCharts, error: workspaceError } =
    workspaceId == null
      ? await workspaceQuery.is("workspace_id", null)
      : await workspaceQuery.eq("workspace_id", workspaceId);

  if (workspaceError) {
    throw new Error(`Failed to fetch workspace charts: ${workspaceError.message}`);
  }

  const allChartIdsInWorkspace = (workspaceCharts || []).map((c: { id: string }) => c.id);

  // 4. マスター配下のチャートIDを特定
  const chartIdsToFetch = getDescendantChartIds(
    masterChartId,
    allChartIdsInWorkspace,
    childToParentChartMap
  );

  // 5. 各チャートのデータを取得
  const chartDataList: TreeSnapshotChartData[] = [];

  for (const chartId of chartIdsToFetch) {
    const { data: chart } = await supabaseClient
      .from("charts")
      .select("id, title")
      .eq("id", chartId)
      .single();

    if (!chart) continue;

    const vrta = await fetchChartVrtaData(chartId, supabaseClient);

    const depth = getChartDepth(chartId, childToParentChartMap);
    const parentChartId = childToParentChartMap.get(chartId) ?? null;

    chartDataList.push({
      chart_id: chartId,
      title: chart.title || "(無題)",
      depth,
      role: depth === 1 ? "master" : "child",
      parent_chart_id: parentChartId,
      visions: vrta.visions,
      realities: vrta.realities,
      tensions: vrta.tensions,
      actions: vrta.actions,
    });
  }

  // depth でソート（マスター→子→孫の順）
  chartDataList.sort((a, b) => a.depth - b.depth);

  // 6. summary を計算
  let totalVisions = 0;
  let totalRealities = 0;
  let totalTensions = 0;
  let totalActions = 0;

  const perChart = chartDataList.map((c) => {
    const v = c.visions.length;
    const r = c.realities.length;
    const t = c.tensions.length;
    const a = c.actions.length;
    totalVisions += v;
    totalRealities += r;
    totalTensions += t;
    totalActions += a;
    return {
      chart_id: c.chart_id,
      title: c.title,
      v,
      r,
      t,
      a,
    };
  });

  return {
    tree_meta: {
      master_chart_id: masterChartId,
      captured_at: capturedAt,
      total_charts: chartDataList.length,
    },
    charts: chartDataList,
    summary: {
      total_visions: totalVisions,
      total_realities: totalRealities,
      total_tensions: totalTensions,
      total_actions: totalActions,
      per_chart: perChart,
    },
  };
}

/**
 * Tree Snapshot を snapshots テーブルに保存
 */
export async function saveTreeSnapshot(
  masterChartId: string,
  data: TreeSnapshotData,
  triggerType: string,
  supabaseClient: SupabaseClient,
  userId?: string
): Promise<string | null> {
  const { data: snapshot, error } = await supabaseClient
    .from("snapshots")
    .insert({
      chart_id: masterChartId,
      created_by: userId ?? null,
      user_id: userId ?? null,
      data,
      snapshot_type: triggerType,
      scope: "tree",
      trigger_type: triggerType,
      description: `Tree snapshot (${triggerType})`,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[saveTreeSnapshot] Insert error:", error);
    return null;
  }

  return snapshot?.id ?? null;
}

/**
 * JSON をキーでソートして比較用の文字列を生成
 */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") +
      "}"
    );
  }
  return JSON.stringify(obj);
}

/**
 * 前回の Tree Snapshot と比較して変更があるか判定
 */
export async function hasChangedSinceLastTreeSnapshot(
  masterChartId: string,
  currentData: TreeSnapshotData,
  supabaseClient: SupabaseClient
): Promise<boolean> {
  const { data: lastSnapshot, error } = await supabaseClient
    .from("snapshots")
    .select("data")
    .eq("chart_id", masterChartId)
    .eq("scope", "tree")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[hasChangedSinceLastTreeSnapshot] Fetch error:", error);
    return true; // エラー時は保存する
  }

  if (!lastSnapshot || !lastSnapshot.data) {
    return true; // 初回なので保存する
  }

  const lastData = lastSnapshot.data as TreeSnapshotData;

  // charts を比較（順序を揃えるためにキーでソート）
  const currentChartsStr = stableStringify(currentData.charts);
  const lastChartsStr = stableStringify(lastData.charts);

  return currentChartsStr !== lastChartsStr;
}
