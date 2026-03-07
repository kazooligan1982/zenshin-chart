const RECENT_CHARTS_KEY = "zenshin_recent_charts";

export function removeChartFromRecent(
  chartId: string,
  workspaceId?: string | null
) {
  if (typeof window === "undefined") return;

  const keys: string[] = [];
  if (workspaceId) {
    keys.push(`${RECENT_CHARTS_KEY}_${workspaceId}`);
  } else {
    keys.push(RECENT_CHARTS_KEY);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${RECENT_CHARTS_KEY}_`)) {
        keys.push(key);
      }
    }
  }

  let changed = false;
  for (const key of keys) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const charts: { id: string }[] = JSON.parse(stored);
      const filtered = charts.filter((c) => c.id !== chartId);
      if (filtered.length !== charts.length) {
        localStorage.setItem(key, JSON.stringify(filtered));
        changed = true;
      }
    } catch {
      // ignore parse errors
    }
  }

  if (changed) {
    window.dispatchEvent(new Event("recentChartsUpdated"));
  }
}
