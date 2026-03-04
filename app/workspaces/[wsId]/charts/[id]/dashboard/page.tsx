"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SnapshotViewer } from "./snapshot-viewer";
import { ChartSwitcher } from "@/components/chart-switcher";
import { AICoachButton } from "@/components/ai-coach-button";
import { snapshotDataToChartDataForAI } from "@/lib/ai/snapshot-to-chart-data";
import ReactMarkdown from "react-markdown";
import { fetchChart } from "../actions";
import {
  Camera,
  Pin,
  PinOff,
  Plus,
  Minus,
  Edit,
  ArrowRight,
  GitCompare,
  X,
  Save,
  ChevronDown,
  Link2,
  Trash2,
  Sparkles,
  Loader2,
  MoreHorizontal,
  Bot,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Snapshot {
  id: string;
  chart_id: string;
  created_at: string;
  snapshot_type: string;
  trigger_type?: string;
  scope?: string;
  description: string | null;
  is_pinned: boolean;
  data: any;
}

interface Comparison {
  id: string;
  snapshot_before_id: string;
  snapshot_after_id: string;
  title: string;
  description: string | null;
  diff_summary: any;
  ai_analysis?: string | null;
  created_at: string;
}

const INITIAL_DISPLAY_COUNT = 20;
const LOAD_MORE_COUNT = 20;

function getSnapshotStats(data: any, scope?: string) {
  if (!data) return { visions: 0, realities: 0, tensions: 0, actions: 0 };
  if (scope === "tree" && data.summary) {
    return {
      visions: data.summary.total_visions ?? 0,
      realities: data.summary.total_realities ?? 0,
      tensions: data.summary.total_tensions ?? 0,
      actions: data.summary.total_actions ?? 0,
    };
  }
  const visions = Array.isArray(data.visions) ? data.visions.length : 0;
  const realities = Array.isArray(data.realities) ? data.realities.length : 0;
  const tensions = Array.isArray(data.tensions) ? data.tensions.length : 0;
  const actions = Array.isArray(data.actions) ? data.actions.length : 0;
  return { visions, realities, tensions, actions };
}

function SnapshotMoreMenu({
  onDelete,
  onCopyUrl,
}: {
  onDelete: () => void;
  onCopyUrl: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-40">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyUrl();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            >
              <Link2 className="w-3.5 h-3.5" />
              {("Copy URL")}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {("Delete")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function SnapshotsPage() {
  const t = useTranslations("snapshot");
  const tCommon = useTranslations("common");
  const tDashboard = useTranslations("dashboard");
  const currentLocale = useLocale();
  const dateLocale = currentLocale === "ja" ? ja : enUS;
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (currentLocale === "ja") {
      return format(d, "yyyy/MM/dd HH:mm", { locale: dateLocale });
    }
    return format(d, "MMM dd, yyyy HH:mm", { locale: dateLocale });
  };
  const formatRelativeTime = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: dateLocale });
  };
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = params?.id as string;
  const wsId = params?.wsId as string | undefined;
  const isWorkspace = pathname?.includes("/workspaces/");

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [loading, setLoading] = useState(true);
  const [chartTitle, setChartTitle] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, string>>({});
  const [compareMode, setCompareMode] = useState(false);
  const [compareSnapshot1, setCompareSnapshot1] = useState<Snapshot | null>(null);
  const [compareSnapshot2, setCompareSnapshot2] = useState<Snapshot | null>(null);
  const [diffs, setDiffs] = useState<any[]>([]);
  const [showDiffs, setShowDiffs] = useState(false);
  const [comparisonAnalysisResult, setComparisonAnalysisResult] = useState<string | null>(null);
  const [comparisonAnalyzing, setComparisonAnalyzing] = useState(false);
  const [saveComparisonDialog, setSaveComparisonDialog] = useState(false);
  const [comparisonTitle, setComparisonTitle] = useState("");
  const [comparisonDescription, setComparisonDescription] = useState("");
  const [activeTab, setActiveTab] = useState<"snapshots" | "comparisons">("snapshots");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const cancelDescriptionEditRef = useRef(false);

  useEffect(() => {
    const snapshotId = searchParams.get("snapshot");
    const viewMode = searchParams.get("view");
    if (snapshotId && viewMode === "data" && snapshots.length > 0) {
      const idx = snapshots.findIndex((s) => s.id === snapshotId);
      if (idx >= 0 && idx >= displayCount) {
        setDisplayCount(idx + 1);
      }
    }
  }, [snapshots, searchParams, displayCount]);

  useEffect(() => {
    if (!projectId) return;
    const fetchData = async () => {
      setLoading(true);

      // チャート名を取得（Server Action経由でRLSを回避）
      try {
        const chartData = await fetchChart(projectId);
        if (chartData) setChartTitle(chartData.title || "");
      } catch (e) {
        console.error("[Snapshots] Failed to fetch chart title:", e);
      }

      const { data: snapshotData, error: snapshotError, count } = await supabase
        .from("snapshots")
        .select("*", { count: "exact" })
        .eq("chart_id", projectId)
        .order("created_at", { ascending: false });


      if (snapshotData) {
        const sorted = [...snapshotData].sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setSnapshots(sorted as Snapshot[]);
      }

      const { data: comparisonData } = await supabase
        .from("snapshot_comparisons")
        .select("*")
        .order("created_at", { ascending: false });

      if (comparisonData) setComparisons(comparisonData as Comparison[]);
      setLoading(false);
    };

    fetchData();
  }, [projectId]);

  const togglePin = async (snapshot: Snapshot) => {
    const newPinned = !snapshot.is_pinned;
    const { error } = await supabase
      .from("snapshots")
      .update({ is_pinned: newPinned })
      .eq("id", snapshot.id);

    if (!error) {
      setSnapshots((prev) =>
        prev
          .map((s) => (s.id === snapshot.id ? { ...s, is_pinned: newPinned } : s))
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return b.is_pinned ? 1 : -1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })
      );
    }
  };

  const saveDescription = async (snapshotId: string) => {
    const { error } = await supabase
      .from("snapshots")
      .update({ description: editDescription })
      .eq("id", snapshotId);

    if (!error) {
      setSnapshots((prev) =>
        prev.map((s) => (s.id === snapshotId ? { ...s, description: editDescription } : s))
      );
      setEditingId(null);
    }
  };

  const analyzeSnapshot = async (snapshot: Snapshot & { data?: any }) => {
    if (analyzingId) return;
    setAnalyzingId(snapshot.id);
    try {
      const chartDataForAI = snapshotDataToChartDataForAI(snapshot.data, chartTitle);
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "snapshot_analyze",
          chartData: chartDataForAI,
          language: currentLocale === "ja" ? "ja" : "en",
          messages: [{ role: "user", content: currentLocale === "ja" ? "このスナップショットを分析してください。" : "Please analyze this snapshot." }],
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setAnalysisResults((prev) => ({ ...prev, [snapshot.id]: data.response }));
    } catch (e) {
      toast.error(t("errorOccurred"));
    } finally {
      setAnalyzingId(null);
    }
  };

  const isSystemDescription = (d: string | null) =>
    !d || d.startsWith("Tree snapshot");
  const displayDescription = (snapshot: Snapshot) =>
    isSystemDescription(snapshot.description) ? null : snapshot.description;

  const startEdit = (snapshot: Snapshot) => {
    setEditingId(snapshot.id);
    setEditDescription(
      isSystemDescription(snapshot.description) ? "" : (snapshot.description || "")
    );
  };

  const deleteSnapshot = async (snapshotId: string) => {
    const { error } = await supabase.from("snapshots").delete().eq("id", snapshotId);
    if (!error) {
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
    }
    setDeleteTargetId(null);
  };

  const saveComparison = async () => {
    if (!compareBefore || !compareAfter) {
      console.error("[saveComparison] Missing snapshots");
      toast.warning(t("saveComparisonSelectSnapshots"));
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const diffSummary = {
        added: diffs.filter((d) => d.type === "added").length,
        modified: diffs.filter((d) => d.type === "modified").length,
        removed: diffs.filter((d) => d.type === "removed").length,
      };

      const insertData = {
        snapshot_before_id: compareBefore.id,
        snapshot_after_id: compareAfter.id,
        title:
          comparisonTitle ||
          `比較: ${format(new Date(compareBefore.created_at), "MM/dd")} → ${format(
            new Date(compareAfter.created_at),
            "MM/dd"
          )}`,
        description: comparisonDescription || null,
        diff_summary: diffSummary,
        diff_details: diffs,
        ai_analysis: comparisonAnalysisResult || null,
        created_by: user?.id || null,
      };


      const { data, error } = await supabase
        .from("snapshot_comparisons")
        .insert(insertData)
        .select()
        .single();


      if (error) {
        console.error("[saveComparison] Error:", error);
        toast.error(t("saveComparisonFailed") + ": " + error.message);
        return;
      }

      if (data) {
        setComparisons((prev) => [data as Comparison, ...prev]);
        setSaveComparisonDialog(false);
        setComparisonTitle("");
        setComparisonDescription("");
        toast.success(t("saveComparisonSuccess"));
        setTimeout(() => {
          exitCompareMode();
          setActiveTab("comparisons");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 800);
      }
    } catch (err) {
      console.error("[saveComparison] Exception:", err);
      toast.error(t("errorOccurred"));
    }
  };

  const calculateDiffs = () => {
    if (!compareSnapshot1 || !compareSnapshot2) return;

    const diffResults: any[] = [];
    const [before, after] =
      new Date(compareSnapshot1.created_at) < new Date(compareSnapshot2.created_at)
        ? [compareSnapshot1, compareSnapshot2]
        : [compareSnapshot2, compareSnapshot1];

    ["visions", "realities", "tensions", "actions"].forEach((category) => {
      const items1 = before.data?.[category] || [];
      const items2 = after.data?.[category] || [];

      items2.forEach((item2: any) => {
        const found = items1.find((item1: any) => item1.id === item2.id);
        if (!found) {
          diffResults.push({ type: "added", category, item: item2 });
        } else if (JSON.stringify(found) !== JSON.stringify(item2)) {
          diffResults.push({ type: "modified", category, before: found, after: item2, item: item2 });
        }
      });

      items1.forEach((item1: any) => {
        if (!items2.find((item2: any) => item2.id === item1.id)) {
          diffResults.push({ type: "removed", category, item: item1 });
        }
      });
    });

    setDiffs(diffResults);
    setShowDiffs(true);
  };

  const handleSnapshotClick = (snapshot: Snapshot) => {
    if (!compareMode) return;
    if (!compareSnapshot1) {
      setCompareSnapshot1(snapshot);
    } else if (!compareSnapshot2 && snapshot.id !== compareSnapshot1.id) {
      setCompareSnapshot2(snapshot);
    } else if (snapshot.id === compareSnapshot1.id) {
      setCompareSnapshot1(null);
    } else if (snapshot.id === compareSnapshot2?.id) {
      setCompareSnapshot2(null);
    }
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareSnapshot1(null);
    setCompareSnapshot2(null);
    setDiffs([]);
    setShowDiffs(false);
    setComparisonAnalysisResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isSelected = (snapshot: Snapshot) =>
    compareSnapshot1?.id === snapshot.id || compareSnapshot2?.id === snapshot.id;

  const [compareBefore, compareAfter] = useMemo(() => {
    if (!compareSnapshot1 || !compareSnapshot2) return [null, null];
    const sorted = [compareSnapshot1, compareSnapshot2].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return [sorted[0], sorted[1]];
  }, [compareSnapshot1, compareSnapshot2]);

  const getSelectionNumber = (snapshot: Snapshot) => {
    if (compareSnapshot1?.id === snapshot.id) return 1;
    if (compareSnapshot2?.id === snapshot.id) return 2;
    return null;
  };

  const analyzeComparison = async () => {
    if (!compareBefore || !compareAfter) return;
    setComparisonAnalyzing(true);
    setComparisonAnalysisResult(null);
    try {
      const added = diffs
        .filter((d) => d.type === "added")
        .map((d) => ({ type: d.category, content: d.item?.content || d.item?.title || "" }));
      const modified = diffs
        .filter((d) => d.type === "modified")
        .map((d) => ({
          type: d.category,
          content: d.item?.content || d.item?.title || "",
          oldContent: d.before?.content || d.before?.title || "",
        }));
      const removed = diffs
        .filter((d) => d.type === "removed")
        .map((d) => ({ type: d.category, content: d.item?.content || d.item?.title || "" }));

      const chartDataForAI = snapshotDataToChartDataForAI(compareAfter.data, chartTitle || "");
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "comparison_analyze",
          locale: currentLocale === "ja" ? "ja" : "en",
          chartData: chartDataForAI,
          comparisonData: {
            before: {
              snapshotId: compareBefore.id,
              createdAt: compareBefore.created_at,
              data: compareBefore.data,
            },
            after: {
              snapshotId: compareAfter.id,
              createdAt: compareAfter.created_at,
              data: compareAfter.data,
            },
            diff: { added, modified, removed },
            summary: {
              addedCount: added.length,
              modifiedCount: modified.length,
              removedCount: removed.length,
            },
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setComparisonAnalysisResult(data.analysis);
    } catch (e) {
      toast.error(t("errorOccurred"));
    } finally {
      setComparisonAnalyzing(false);
    }
  };

  const displayedSnapshots = snapshots.slice(0, displayCount);
  const hasMore = snapshots.length > displayCount;

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Camera className="w-6 h-6" />
          {t("title")}
        </h1>
        {chartTitle && (
          <ChartSwitcher currentChartTitle={chartTitle} subPage="snapshots" />
        )}
      </div>

      {showDiffs && (
        <div className="mb-8 space-y-4">
          <Card className="bg-gray-50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-500">{t("before")}</p>
                    <p className="font-medium">
                      {formatDate(compareBefore!.created_at)}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{t("after")}</p>
                    <p className="font-medium">
                      {formatDate(compareAfter!.created_at)}
                    </p>
                  </div>
                </div>
                <Button onClick={() => setSaveComparisonDialog(true)} size="sm">
                  <Save className="w-4 h-4 mr-2" />
                  {t("saveComparison")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-green-600" />
                  <span className="font-medium">{diffs.filter((d) => d.type === "added").length} {t("added")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Edit className="w-5 h-5 text-yellow-600" />
                  <span className="font-medium">{diffs.filter((d) => d.type === "modified").length} {t("modified")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Minus className="w-5 h-5 text-red-600" />
                  <span className="font-medium">{diffs.filter((d) => d.type === "removed").length} {t("removed")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <button
            onClick={analyzeComparison}
            disabled={comparisonAnalyzing}
            className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all disabled:opacity-50"
          >
            {comparisonAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {currentLocale === "ja" ? "分析中..." : "Analyzing..."}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {currentLocale === "ja" ? "AIで変化を分析する" : "Analyze changes with AI"}
              </>
            )}
          </button>

          {comparisonAnalysisResult && (
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-blue-100/60">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-xs font-semibold text-indigo-700">AI Coach Insight</span>
                </div>
                <button
                  onClick={() => setComparisonAnalysisResult(null)}
                  className="text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 py-3 text-sm text-gray-700 prose prose-sm max-w-none leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>li]:mb-0.5 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mb-1 [&>strong]:text-gray-800">
                <ReactMarkdown>{comparisonAnalysisResult}</ReactMarkdown>
              </div>
              <div className="px-4 py-2.5 border-t border-blue-100/60 bg-white/60">
                <button
                  onClick={() => {
                    const comparisonDataForEscalation = {
                      before: {
                        snapshotId: compareBefore!.id,
                        createdAt: compareBefore!.created_at,
                        data: compareBefore!.data,
                      },
                      after: {
                        snapshotId: compareAfter!.id,
                        createdAt: compareAfter!.created_at,
                        data: compareAfter!.data,
                      },
                      diff: {
                        added: diffs.filter((d) => d.type === "added").map((d) => ({ type: d.category, content: d.item?.content || d.item?.title || "" })),
                        modified: diffs.filter((d) => d.type === "modified").map((d) => ({ type: d.category, content: d.item?.content || d.item?.title || "", oldContent: d.before?.content || d.before?.title || "" })),
                        removed: diffs.filter((d) => d.type === "removed").map((d) => ({ type: d.category, content: d.item?.content || d.item?.title || "" })),
                      },
                      summary: {
                        addedCount: diffs.filter((d) => d.type === "added").length,
                        modifiedCount: diffs.filter((d) => d.type === "modified").length,
                        removedCount: diffs.filter((d) => d.type === "removed").length,
                      },
                    };
                    window.dispatchEvent(
                      new CustomEvent("open-ai-coach", {
                        detail: {
                          mode: "chat",
                          initialContext: {
                            type: "comparison_escalation",
                            analysisResult: comparisonAnalysisResult,
                            comparisonData: comparisonDataForEscalation,
                            chartName: chartTitle,
                          },
                        },
                      })
                    );
                  }}
                  className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 cursor-pointer hover:underline hover:text-blue-700 transition-colors duration-150"
                >
                  <Bot className="w-4 h-4" />
                  {currentLocale === "ja" ? "AI Coach でもっと詳しく分析する →" : "Analyze deeper with AI Coach →"}
                </button>
              </div>
            </div>
          )}

          {diffs.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {diffs.map((diff, index) => (
                <Card
                  key={index}
                  className={`border-l-4 ${
                    diff.type === "added"
                      ? "border-l-green-500"
                      : diff.type === "removed"
                        ? "border-l-red-500"
                        : "border-l-yellow-500"
                  }`}
                >
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      {diff.type === "added" && <Plus className="w-4 h-4 text-green-600 mt-0.5" />}
                      {diff.type === "removed" && <Minus className="w-4 h-4 text-red-600 mt-0.5" />}
                      {diff.type === "modified" && <Edit className="w-4 h-4 text-yellow-600 mt-0.5" />}
                      <div className="flex-1">
                        <Badge variant="outline" className="text-xs mb-1">
                          {diff.category}
                        </Badge>
                        <p className="text-sm">
                          {diff.item?.content || diff.item?.title || t("noContent")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">{t("noDiffs")}</CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={exitCompareMode} className="w-full">
            {t("closeDiffs")}
          </Button>
        </div>
      )}

      {!showDiffs && (
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const newTab = value as "snapshots" | "comparisons";
            if (newTab === "comparisons" && compareMode) {
              exitCompareMode();
            }
            setActiveTab(newTab);
          }}
        >
          {compareMode && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
              <div className="flex items-center gap-3">
                <GitCompare className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {compareSnapshot1 && compareSnapshot2
                      ? t("readyToCompare")
                      : compareSnapshot1
                        ? t("selectSecondSnapshot")
                        : t("selectFirstSnapshot")}
                  </p>
                  <p className="text-xs text-blue-600">
                    {[compareSnapshot1, compareSnapshot2].filter(Boolean).length} / 2 {t("selected")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {compareSnapshot1 && compareSnapshot2 && (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={calculateDiffs}
                  >
                    {t("compare")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-blue-600 hover:bg-blue-100"
                  onClick={exitCompareMode}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <TabsList className="grid w-auto grid-cols-2">
              <TabsTrigger value="snapshots" className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                {t("title")} ({snapshots.length})
              </TabsTrigger>
              <TabsTrigger value="comparisons" className="flex items-center gap-2">
                <GitCompare className="w-4 h-4" />
                {t("comparisonHistory")} ({comparisons.length})
              </TabsTrigger>
            </TabsList>
            {activeTab === "snapshots" && (
              <Button
                variant={compareMode ? "default" : "outline"}
                className={compareMode ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"}
                onClick={compareMode ? exitCompareMode : () => setCompareMode(true)}
              >
                <GitCompare className="w-4 h-4 mr-2" />
                {compareMode ? t("exitCompare") : t("comparisonMode")}
              </Button>
            )}
          </div>

          <TabsContent value="snapshots" className="space-y-3">
            {snapshots.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">{t("noSnapshots")}</CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {displayedSnapshots.map((snapshot) => (
                    <Card
                      key={snapshot.id}
                      className={`transition-all ${compareMode ? "cursor-pointer hover:shadow-md" : ""} ${
                        isSelected(snapshot) ? "ring-2 ring-blue-500 bg-blue-50" : "hover:bg-gray-50"
                      }`}
                      onClick={() => compareMode && handleSnapshotClick(snapshot)}
                    >
                      <CardContent className="p-0">
                        {/* Top bar: type + date + actions */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                          <div className="flex items-center gap-2.5">
                            {compareMode && getSelectionNumber(snapshot) && (
                              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium shrink-0">
                                {getSelectionNumber(snapshot)}
                              </div>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 uppercase tracking-wider ${
                                snapshot.trigger_type === "auto_daily"
                                  ? "bg-blue-50 text-blue-600 border-blue-200"
                                  : "border-gray-200 text-gray-500"
                              }`}
                            >
                              {snapshot.trigger_type === "auto_daily"
                                ? t("auto_daily")
                                : t("manual")}
                            </Badge>
                            {snapshot.scope === "tree" && (
                              <Badge className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                🌳 {t("tree")}
                              </Badge>
                            )}
                            <p className="text-sm font-semibold text-gray-800">
                              {formatDate(snapshot.created_at)}
                            </p>
                            <span className="text-xs text-gray-400">
                              {formatRelativeTime(snapshot.created_at)}
                            </span>
                          </div>
                          {!compareMode && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePin(snapshot);
                                }}
                                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                                  snapshot.is_pinned
                                    ? "text-amber-500 bg-amber-50"
                                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                                }`}
                              >
                                {snapshot.is_pinned ? (
                                  <PinOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Pin className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <SnapshotMoreMenu
                                onDelete={() => setDeleteTargetId(snapshot.id)}
                                onCopyUrl={async () => {
                                  const base = window.location.origin;
                                  const path = isWorkspace && wsId
                                    ? `/workspaces/${wsId}/charts/${projectId}/dashboard`
                                    : `/charts/${projectId}/dashboard`;
                                  const url = `${base}${path}?snapshot=${snapshot.id}&view=data`;
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    toast.success(t("linkCopied"));
                                  } catch {
                                    toast.error(t("copyFailed"));
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* VRTA Stats Grid */}
                        {(() => {
                          const stats = getSnapshotStats(snapshot.data, snapshot.scope);
                          const isTree = snapshot.scope === "tree";
                          const totalCharts = isTree && snapshot.data?.tree_meta?.total_charts;
                          return (
                            <div className="px-5 py-3">
                              <div className="grid grid-cols-4 gap-2">
                                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-emerald-50">
                                  <span className="text-lg font-bold text-emerald-600 leading-none">{stats.visions}</span>
                                  <span className="text-[10px] font-medium mt-1 text-emerald-600/70">Visions</span>
                                </div>
                                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-orange-50">
                                  <span className="text-lg font-bold text-orange-500 leading-none">{stats.realities}</span>
                                  <span className="text-[10px] font-medium mt-1 text-orange-500/70">Realities</span>
                                </div>
                                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-sky-50">
                                  <span className="text-lg font-bold text-sky-600 leading-none">{stats.tensions}</span>
                                  <span className="text-[10px] font-medium mt-1 text-sky-600/70">Tensions</span>
                                </div>
                                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-slate-50">
                                  <span className="text-lg font-bold text-slate-600 leading-none">{stats.actions}</span>
                                  <span className="text-[10px] font-medium mt-1 text-slate-600/70">Actions</span>
                                </div>
                              </div>
                              {isTree && totalCharts != null && (
                                <p className="text-xs text-slate-400 text-center mt-1">
                                  {t("chartsTotal", { count: totalCharts })}
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Description */}
                        <div className="px-5 pb-2">
                          {editingId === snapshot.id ? (
                            <Input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder={t("descriptionPlaceholder")}
                              className="h-8 text-sm"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveDescription(snapshot.id);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelDescriptionEditRef.current = true;
                                  setEditDescription(
                                    isSystemDescription(snapshot.description)
                                      ? ""
                                      : (snapshot.description || "")
                                  );
                                  setEditingId(null);
                                }
                              }}
                              onBlur={() => {
                                if (cancelDescriptionEditRef.current) {
                                  cancelDescriptionEditRef.current = false;
                                  return;
                                }
                                saveDescription(snapshot.id);
                              }}
                            />
                          ) : (
                            <p
                              className={`text-sm cursor-pointer transition-colors ${
                                displayDescription(snapshot)
                                  ? "text-gray-600"
                                  : "text-gray-300 hover:text-gray-400"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(snapshot);
                              }}
                            >
                              {displayDescription(snapshot) || t("addDescription")}
                            </p>
                          )}
                        </div>

                        {/* AI Analysis */}
                        {!compareMode && (
                          <>
                            {analysisResults[snapshot.id] ? (
                              <div className="mx-5 mb-3">
                                <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white overflow-hidden">
                                  <div className="flex items-center justify-between px-4 py-2 border-b border-blue-100/60">
                                    <div className="flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                      <span className="text-xs font-semibold text-indigo-700">AI Coach Insight</span>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAnalysisResults((prev) => {
                                          const next = { ...prev };
                                          delete next[snapshot.id];
                                          return next;
                                        });
                                      }}
                                      className="text-gray-300 hover:text-gray-500 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="px-4 py-3 text-sm text-gray-700 prose prose-sm max-w-none leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>li]:mb-0.5 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mb-1 [&>strong]:text-gray-800">
                                    <ReactMarkdown>{analysisResults[snapshot.id]}</ReactMarkdown>
                                  </div>
                                  <div className="px-4 py-2.5 border-t border-blue-100/60 bg-white/60">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const handleEscalateToCoach = () => {
                                          window.dispatchEvent(
                                            new CustomEvent("open-ai-coach", {
                                              detail: {
                                                mode: "chat",
                                                initialContext: {
                                                  type: "snapshot_escalation",
                                                  snapshotId: snapshot.id,
                                                  analysisResult: analysisResults[snapshot.id],
                                                  snapshotData: snapshot.data,
                                                  chartName: chartTitle,
                                                },
                                              },
                                            })
                                          );
                                        };
                                        handleEscalateToCoach();
                                      }}
                                      className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 cursor-pointer hover:underline hover:text-blue-700 transition-colors duration-150"
                                    >
                                      <Bot className="w-4 h-4" />
                                      {currentLocale === "ja" ? "AI Coach でもっと詳しく分析する →" : "Analyze deeper with AI Coach →"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </>
                        )}

                        {/* Bottom bar: AI button + View Data */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
                          {!compareMode && !analysisResults[snapshot.id] ? (
                            <button
                              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all disabled:opacity-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                analyzeSnapshot(snapshot as Snapshot & { data?: any });
                              }}
                              disabled={!!analyzingId}
                            >
                              {analyzingId === snapshot.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  {currentLocale === "ja" ? "分析中..." : "Analyzing..."}
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4" />
                                  {currentLocale === "ja" ? "AIで分析する" : "Analyze with AI"}
                                </>
                              )}
                            </button>
                          ) : (
                            <div />
                          )}
                          <div onClick={(e) => e.stopPropagation()}>
                            <SnapshotViewer
                              snapshot={snapshot}
                              autoOpen={
                                searchParams.get("snapshot") === snapshot.id &&
                                searchParams.get("view") === "data"
                              }
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {hasMore && (
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => setDisplayCount((prev) => prev + LOAD_MORE_COUNT)}
                  >
                    <ChevronDown className="w-4 h-4 mr-2" />
                    {tDashboard("loadMore", { count: snapshots.length - displayCount })}
                  </Button>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="comparisons" className="space-y-3">
            {comparisons.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  <GitCompare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>{t("noComparisons")}</p>
                  <p className="text-sm mt-1">
                    {t("comparisonHint")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              comparisons.map((comp) => (
                <Card key={comp.id} className="hover:bg-gray-50 transition-colors overflow-hidden">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{comp.title}</p>
                        {comp.description && <p className="text-sm text-gray-500 mt-1">{comp.description}</p>}
                        <p className="text-xs text-gray-400 mt-2">
                          {formatDate(comp.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-sm ml-4">
                        <span className="flex items-center gap-1 text-green-600">
                          <Plus className="w-4 h-4" />
                          {comp.diff_summary?.added || 0}
                        </span>
                        <span className="flex items-center gap-1 text-yellow-600">
                          <Edit className="w-4 h-4" />
                          {comp.diff_summary?.modified || 0}
                        </span>
                        <span className="flex items-center gap-1 text-red-600">
                          <Minus className="w-4 h-4" />
                          {comp.diff_summary?.removed || 0}
                        </span>
                      </div>
                    </div>
                    {comp.ai_analysis && (
                      <div className="mt-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white overflow-hidden">
                        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-blue-100/60">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-xs font-semibold text-indigo-700">AI Coach Insight</span>
                        </div>
                        <div className="px-4 py-3 text-sm text-gray-700 prose prose-sm max-w-none leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>li]:mb-0.5 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mb-1 [&>strong]:text-gray-800">
                          <ReactMarkdown>{comp.ai_analysis}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={saveComparisonDialog} onOpenChange={setSaveComparisonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveComparisonTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{t("titleLabel")}</label>
              <Input
                value={comparisonTitle}
                onChange={(e) => setComparisonTitle(e.target.value)}
                placeholder={`比較: ${
                  compareBefore ? format(new Date(compareBefore.created_at), "MM/dd") : ""
                } → ${compareAfter ? format(new Date(compareAfter.created_at), "MM/dd") : ""}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("memoLabel")}</label>
              <Textarea
                value={comparisonDescription}
                onChange={(e) => setComparisonDescription(e.target.value)}
                placeholder={t("memoPlaceholder")}
                rows={3}
              />
            </div>
            <Button onClick={saveComparison} className="w-full">
              {tCommon("save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent className="rounded-2xl border-gray-200 shadow-xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-zenshin-navy">
              {t("deleteConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              {t("deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg px-4 py-2 text-sm">
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600"
              onClick={() => deleteTargetId && deleteSnapshot(deleteTargetId)}
            >
              {t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AICoachButton
        chartData={snapshotDataToChartDataForAI({}, chartTitle || "")}
        chartId={projectId}
      />
    </div>
  );
}

