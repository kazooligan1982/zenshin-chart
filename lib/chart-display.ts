/**
 * Returns the chart title for display, falling back to a translated
 * "Untitled chart" string when the title is empty or whitespace-only.
 *
 * @param chart  Object with a `title` property (may be null/empty)
 * @param t      Translation function that resolves "untitled_chart"
 */
export function getChartDisplayTitle(
  chart: { title?: string | null },
  t: (key: string) => string
): string {
  return chart.title?.trim() || t("untitled_chart");
}
