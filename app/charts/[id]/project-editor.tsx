"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { TensionDragOverlay } from "./components/TensionDragOverlay";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Home,
  Target,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Trash2,
  Zap,
  Maximize2,
  Minimize2,
  Calendar as CalendarIcon,
  Camera,
  FileText,
  Settings,
  MoreVertical,
  CheckCircle2,
  Archive,
  ArrowUpDown,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  Chart,
  Tension,
  ActionPlan,
  BreadcrumbItem,
  VisionItem,
  RealityItem,
  TensionStatus,
  Area,
} from "@/types/chart";
import {
  getActionProgress,
  createSnapshot,
  createTreeSnapshot,
  updateChartData,
  addArea,
  updateAreaItem,
  removeArea,
  moveActionToTension,
  moveActionToLoose,
  addVision,
  addReality,
  addTension,
  addActionPlan,
} from "./actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
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
import { archiveChart, restoreChart, deleteChart } from "@/lib/charts-actions";
import { removeChartFromRecent } from "@/lib/recent-charts";
import { updateChartStatusAction } from "./actions";
import { useItemInput } from "@/hooks/use-item-input";
import {
  StructuredData,
  customCollisionDetection,
  splitItemsByDate,
  sortItemsByFutureDateFirst,
} from "./editor-utils";
import { SortableVisionItem } from "./components/SortableVisionItem";
import { SortableRealityItem } from "./components/SortableRealityItem";
import { AreaDropZone } from "./components/AreaDropZone";
import { SortableAreaSection } from "@/components/SortableAreaSection";
import { TensionGroup } from "./components/TensionGroup";
import { ActionSection } from "./components/ActionSection";
import { useVisionHandlers } from "./hooks/useVisionHandlers";
import { useRealityHandlers } from "./hooks/useRealityHandlers";
import { useTensionHandlers } from "./hooks/useTensionHandlers";
import { useActionHandlers, _pendingScrollRestore } from "./hooks/useActionHandlers";
import { useDetailPanel } from "./hooks/useDetailPanel";
import { useDndHandlers } from "./hooks/useDndHandlers";
import { WelcomeCard } from "@/components/ai-assistant/WelcomeCard";
import { AICoachButton, type StructuredItems } from "@/components/ai-coach-button";
import { collectChartDataForAI } from "@/lib/ai/collect-chart-data";
import ProposalsPanel from "@/components/proposals-panel";
import { canApproveProposal } from "@/lib/permissions";

const CalendarComponent = dynamic(
  () => import("@/components/ui/calendar").then((mod) => mod.Calendar),
  { loading: () => null, ssr: false }
);
const TagManager = dynamic(
  () => import("@/components/tag/TagManager").then((mod) => mod.TagManager),
  { loading: () => null, ssr: false }
);
const ItemDetailPanel = dynamic(
  () =>
    import("@/components/item-detail-panel").then((mod) => mod.ItemDetailPanel),
  { loading: () => null, ssr: false }
);
const ActionEditModal = dynamic(
  () =>
    import("./kanban/action-edit-modal").then((mod) => mod.ActionEditModal),
  { loading: () => null, ssr: false }
);
const FocusModeModal = dynamic(
  () =>
    import("@/components/focus-mode-modal").then((mod) => mod.FocusModeModal),
  { loading: () => null, ssr: false }
);
const UnifiedDetailModal = dynamic(
  () =>
    import("@/components/unified-detail-modal/UnifiedDetailModal").then(
      (mod) => mod.UnifiedDetailModal
    ),
  { loading: () => null, ssr: false }
);

type WorkspaceMember = {
  id: string;
  email: string;
  name?: string;
  role: string;
  avatar_url?: string;
};

interface ProjectEditorProps {
  initialChart: Chart;
  chartId: string;
  workspaceId?: string;
  currentUserId: string;
  currentUser?: {
    id: string;
    email: string;
    name?: string;
    avatar_url?: string | null;
  } | null;
  workspaceMembers?: WorkspaceMember[];
}

export function ProjectEditor({
  initialChart,
  chartId,
  workspaceId,
  currentUserId,
  currentUser: initialCurrentUser,
  workspaceMembers = [],
}: ProjectEditorProps) {
  const t = useTranslations("editor");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const tTags = useTranslations("tags");
  const tSidebar = useTranslations("sidebar");
  const tk = useTranslations("kanban");
  const tAction = useTranslations("action");
  const router = useRouter();
  const searchParams = useSearchParams();
  // areasがundefinedの場合に空配列を設定
  const chartWithAreas: Chart = {
    ...initialChart,
    areas: initialChart.areas || [],
  };
  const [chart, setChart] = useState<Chart>(chartWithAreas);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chart?.id || !chart?.title) return;
    const wsKey = chart.workspace_id
      ? `zenshin_recent_charts_${chart.workspace_id}`
      : "zenshin_recent_charts";
    const stored = localStorage.getItem(wsKey);
    let recentCharts: { id: string; title: string; visitedAt: string }[] = [];
    try {
      recentCharts = stored ? JSON.parse(stored) : [];
    } catch {
      recentCharts = [];
    }
    const nextRecent = {
      id: chart.id,
      title: chart.title,
      visitedAt: new Date().toISOString(),
    };
    const filtered = recentCharts.filter((item) => item.id !== chart.id);
    const updated = [nextRecent, ...filtered].slice(0, 3);
    localStorage.setItem(wsKey, JSON.stringify(updated));
    window.dispatchEvent(new Event("recentChartsUpdated"));
  }, [chart?.id, chart?.title, chart?.workspace_id]);
  const [visions, setVisions] = useState<VisionItem[]>(chart.visions ?? []);
  const [realities, setRealities] = useState<RealityItem[]>(chart.realities ?? []);
  const [tensions, setTensions] = useState<Tension[]>(chart.tensions);
  // 楽観的操作中のカウンター（0より大きい間はサーバーデータでstateを上書きしない）
  const optimisticOpsRef = useRef(0);
  const [breadcrumbs] = useState<BreadcrumbItem[]>(chart.breadcrumbs || []);
  const [hoveredSection, setHoveredSection] = useState<
    "vision" | "reality" | "tension" | null
  >(null);
  const [focusedArea, setFocusedArea] = useState<
    "vision" | "reality" | "tension" | null
  >(null);
  const [viewMode, setViewMode] = useState<"default" | "comparison">("default");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [archiveChartDialogOpen, setArchiveChartDialogOpen] = useState(false);
  const [deleteChartDialogOpen, setDeleteChartDialogOpen] = useState(false);
  const chartTitleInput = useItemInput({
    initialValue: chart.title || "",
    onSave: (val) => {
      if (val !== chart.title) {
        updateChartData(chartId, { title: val });
      }
    },
  });
  const newVisionInput = useItemInput({
    initialValue: "",
    onSave: () => {},
    sectionId: "new-vision",
  });
  const newRealityInput = useItemInput({
    initialValue: "",
    onSave: () => {},
    sectionId: "new-reality",
  });
  // 削除遅延実行用の状態管理
  const [pendingDeletions, setPendingDeletions] = useState<{
    [key: string]: {
      type: "vision" | "reality" | "action" | "tension";
      item: any;
      tensionId?: string | null;
      timeoutId: NodeJS.Timeout;
    };
  }>({});
  
  const [focusMode, setFocusMode] = useState<{
    isOpen: boolean;
    sectionType: "vision" | "reality" | "tension";
    itemId: string;
    title: string;
    content: string;
  } | null>(null);
  const [looseActions, setLooseActions] = useState<ActionPlan[]>([]);
  const [telescopingActionId, setTelescopingActionId] = useState<string | null>(null);
  const [actionProgress, setActionProgress] = useState<
    Record<string, { total: number; completed: number; percentage: number }>
  >({});
  const [isSubmittingVision, setIsSubmittingVision] = useState(false);
  const [isSubmittingReality, setIsSubmittingReality] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState<Record<string, boolean>>({});
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [snapshotDropdownOpen, setSnapshotDropdownOpen] = useState(false);
  const snapshotDropdownRef = useRef<HTMLDivElement>(null);
  const [isChartMenuLoading, setIsChartMenuLoading] = useState(false);
  const [isProposalsPanelOpen, setIsProposalsPanelOpen] = useState(false);
  const [pendingProposalsCount, setPendingProposalsCount] = useState(0);
  const [currentUser] = useState<{
    id: string;
    email: string;
    name?: string;
    avatar_url?: string | null;
  } | null>(initialCurrentUser ?? null);
  const [chartDueDate, setChartDueDate] = useState<string | null>(initialChart.due_date || null);
  const [chartDueDateOpen, setChartDueDateOpen] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("all"); // エリア選択状態
  const [sortByStatus, setSortByStatus] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showCompletedTensions, setShowCompletedTensions] = useState(false);
  const [expandedCompletedTensions, setExpandedCompletedTensions] = useState<Set<string>>(new Set());
  const { handleAddVision, handleUpdateVision, handleDeleteVision } = useVisionHandlers({
    chartId,
    visions,
    setVisions,
    selectedAreaId,
    isSubmittingVision,
    setIsSubmittingVision,
    pendingDeletions,
    setPendingDeletions,
    newVisionInput,
    chart,
    router,
    optimisticOpsRef,
  });

  const { handleAddReality, handleUpdateReality, handleDeleteReality } = useRealityHandlers({
    chartId,
    realities,
    setRealities,
    selectedAreaId,
    isSubmittingReality,
    setIsSubmittingReality,
    pendingDeletions,
    setPendingDeletions,
    newRealityInput,
    chart,
    router,
    optimisticOpsRef,
  });

  const { handleAddTension, handleUpdateTension, handleDeleteTension, handleMoveTensionArea, toggleVisionRealityLink, handleOptimisticMove } = useTensionHandlers({
    chartId,
    tensions,
    setTensions,
    visions,
    realities,
    looseActions,
    setLooseActions,
    pendingDeletions,
    setPendingDeletions,
    areas: chart.areas ?? [],
    router,
  });

  const { handleAddActionPlan, handleUpdateActionPlan, handleDeleteActionPlan, handleTelescopeClick } = useActionHandlers({
    chartId,
    tensions,
    setTensions,
    looseActions,
    setLooseActions,
    isSubmittingAction,
    setIsSubmittingAction,
    pendingDeletions,
    setPendingDeletions,
    setTelescopingActionId,
    router,
  });

  const { detailPanel, itemHistory, isLoadingHistory, handleOpenDetailPanel, handleCloseDetailPanel, handleAddHistory, handleCommentCountChange } = useDetailPanel({
    chartId,
    setVisions,
    setRealities,
    setTensions,
    setLooseActions,
    router,
  });

  // UnifiedDetailModal（Phase 1: 既存トリガーを新モーダルに切り替え）
  const [unifiedModal, setUnifiedModal] = useState<{
    isOpen: boolean;
    itemType: "vision" | "reality" | "action";
    itemId: string;
  } | null>(null);
  const openUnifiedModal = (itemType: "vision" | "reality" | "action", itemId: string) => {
    setUnifiedModal({ isOpen: true, itemType, itemId });
  };
  const closeUnifiedModal = () => setUnifiedModal(null);

  // ディープリンク: URLパラメータからモーダルを自動オープン
  useEffect(() => {
    const type = searchParams.get("type");
    const item = searchParams.get("item");
    if (type && item && ["vision", "reality", "action"].includes(type)) {
      openUnifiedModal(type as "vision" | "reality" | "action", item);
      // パラメータをURLから除去（履歴を汚さない）
      const url = new URL(window.location.href);
      url.searchParams.delete("type");
      url.searchParams.delete("item");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  const handleOpenDetailPanelForModal = (
    itemType: "vision" | "reality" | "action",
    itemId: string,
    _itemContent?: string
  ) => {
    openUnifiedModal(itemType, itemId);
  };

  const toggleCompletedTensionExpand = (tensionId: string) => {
    setExpandedCompletedTensions((prev) => {
      const next = new Set(prev);
      if (next.has(tensionId)) {
        next.delete(tensionId);
      } else {
        next.add(tensionId);
      }
      return next;
    });
  };

  const isTensionCompleted = (tension: Tension) => {
    if (tension.status === "resolved") return true;
    if (
      tension.actionPlans.length > 0 &&
      tension.actionPlans.every((a) => a.status === "done" || a.isCompleted)
    ) {
      return true;
    }
    return false;
  };

  const openFocusMode = (
    sectionType: "vision" | "reality" | "tension",
    itemId: string,
    title: string,
    content: string
  ) => {
    setFocusMode({
      isOpen: true,
      sectionType,
      itemId,
      title,
      content,
    });
  };

  const handleFocusModeSave = async (newContent: string) => {
    if (!focusMode) return;
    const trimmed = newContent.trim();
    if (trimmed === focusMode.content.trim()) return;

    if (focusMode.sectionType === "vision") {
      setVisions((prev) =>
        prev.map((vision) =>
          vision.id === focusMode.itemId
            ? { ...vision, content: trimmed }
            : vision
        )
      );
      await handleUpdateVision(focusMode.itemId, "content", trimmed);
      return;
    }

    if (focusMode.sectionType === "reality") {
      setRealities((prev) =>
        prev.map((reality) =>
          reality.id === focusMode.itemId
            ? { ...reality, content: trimmed }
            : reality
        )
      );
      await handleUpdateReality(focusMode.itemId, "content", trimmed);
      return;
    }

    setTensions((prev) =>
      prev.map((tension) =>
        tension.id === focusMode.itemId
          ? { ...tension, title: trimmed }
          : tension
      )
    );
    await handleUpdateTension(focusMode.itemId, "title", trimmed);
  };

  // D&D sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ナンバリング関数: Visionに番号を付与（日付が近い順に若い番号、日付がないものは作成順）
  const assignVisionNumbers = (visions: VisionItem[]): Array<{ vision: VisionItem; number: number }> => {
    const now = Date.now();
    const withDates = visions
      .filter(v => v.targetDate)
      .map(v => ({
        vision: v,
        date: new Date(v.targetDate!).getTime(),
        created: new Date((v as any).created_at || (v as any).createdAt || 0).getTime(),
      }))
      .sort((a, b) => {
        // 日付が近い順（現在に近い順）にソート
        const diffA = Math.abs(a.date - now);
        const diffB = Math.abs(b.date - now);
        if (diffA !== diffB) {
          return diffA - diffB; // 近い順
        }
        return a.created - b.created; // 同じ距離なら作成順
      });
    
    const withoutDates = visions
      .filter(v => !v.targetDate)
      .map(v => ({
        vision: v,
        created: new Date((v as any).created_at || (v as any).createdAt || 0).getTime(),
      }))
      .sort((a, b) => a.created - b.created); // 作成順（古い順）
    
    const result: Array<{ vision: VisionItem; number: number }> = [];
    let number = 1;
    
    // 日付があるものに番号を付与
    for (const item of withDates) {
      result.push({ vision: item.vision, number });
      number++;
    }
    
    // 日付がないものに続きの番号を付与
    for (const item of withoutDates) {
      result.push({ vision: item.vision, number });
      number++;
    }
    
    return result;
  };

  // ソート関数: Visionを番号の昇順でソート（表示用）#01が一番下、最大の番号が一番上
  // 降順表示にするため、配列を反転させる
  const sortVisionsByDate = (visions: VisionItem[]): VisionItem[] => {
    const numbered = assignVisionNumbers(visions);
    return numbered
      .sort((a, b) => {
        // 番号の昇順でソート（#1が最初、最大の番号が最後）
        return a.number - b.number;
      })
      .reverse() // 反転して降順表示（#1が一番下、最大の番号が一番上）
      .map(item => item.vision);
  };

  // Visionに番号を付与して降順でソートした結果を返す（表示用）
  const getSortedAndNumberedVisions = (visions: VisionItem[]): Array<{ vision: VisionItem; number: number }> => {
    const numbered = assignVisionNumbers(visions);
    return numbered
      .sort((a, b) => {
        // 番号の昇順でソート（#1が最初、最大の番号が最後）
        return a.number - b.number;
      })
      .reverse(); // 反転して降順表示（#1が一番下、最大の番号が一番上）
  };

  // Realityを降順でソート（作成順の降順、古いものが下、新しいものが上）
  const sortRealitiesByDate = (realities: RealityItem[]): RealityItem[] => {
    return [...realities].sort((a, b) => {
      const dateA = new Date((a as any).created_at || (a as any).createdAt || 0).getTime();
      const dateB = new Date((b as any).created_at || (b as any).createdAt || 0).getTime();
      // 降順（新しいものが上、古いものが下）
      return dateB - dateA;
    });
  };

  // ナンバリング関数: Actionに番号を付与（日付が近い順に若い番号、日付がないものは作成順）
  const assignActionNumbers = (actions: ActionPlan[]): Array<{ action: ActionPlan; number: number }> => {
    const now = Date.now();
    const withDates = actions
      .filter(a => a.dueDate)
      .map(a => ({
        action: a,
        date: new Date(a.dueDate!).getTime(),
        created: new Date((a as any).created_at || (a as any).createdAt || 0).getTime(),
      }))
      .sort((a, b) => {
        // 日付が近い順（現在に近い順）にソート
        const diffA = Math.abs(a.date - now);
        const diffB = Math.abs(b.date - now);
        if (diffA !== diffB) {
          return diffA - diffB; // 近い順
        }
        return a.created - b.created; // 同じ距離なら作成順
      });
    
    const withoutDates = actions
      .filter(a => !a.dueDate)
      .map(a => ({
        action: a,
        created: new Date((a as any).created_at || (a as any).createdAt || 0).getTime(),
      }))
      .sort((a, b) => a.created - b.created); // 作成順（古い順）
    
    const result: Array<{ action: ActionPlan; number: number }> = [];
    let number = 1;
    
    // 日付があるものに番号を付与
    for (const item of withDates) {
      result.push({ action: item.action, number });
      number++;
    }
    
    // 日付がないものに続きの番号を付与
    for (const item of withoutDates) {
      result.push({ action: item.action, number });
      number++;
    }
    
    return result;
  };

  // ソート関数: Actionを番号の降順でソート（表示用）#01が一番下、最大の番号が一番上
  const sortActionsByDate = (actions: ActionPlan[]): ActionPlan[] => {
    const numbered = assignActionNumbers(actions);
    return numbered
      .sort((a, b) => {
        // 番号の降順でソート（#1が一番下、最大の番号が一番上）
        return b.number - a.number;
      })
      .map(item => item.action);
  };

  // Actionに番号を付与して降順でソートした結果を返す（表示用）
  const getSortedAndNumberedActions = (actions: ActionPlan[]): Array<{ action: ActionPlan; number: number }> => {
    const numbered = assignActionNumbers(actions);
    return numbered.sort((a, b) => {
      // 番号の降順でソート（#1が一番下、最大の番号が一番上）
      return b.number - a.number;
    });
  };

  const chartSyncKey = useMemo(
    () =>
      JSON.stringify({
        visions: initialChart.visions,
        realities: initialChart.realities,
        tensions: initialChart.tensions,
        looseActions: initialChart.looseActions,
        areas: initialChart.areas,
        dueDate: initialChart.due_date,
      }),
    [initialChart]
  );

  // Chartデータが更新されたら状態を更新
  // initialChartが変更されたら（router.refresh()後）状態を更新
  useEffect(() => {
    // 楽観的操作中はサーバーデータで上書きしない（フラッシュバック防止）
    if (optimisticOpsRef.current > 0) return;

    // areasがundefinedの場合に空配列を設定
    const chartWithAreas: Chart = {
      ...initialChart,
      areas: initialChart.areas || [],
    };
    setChart(chartWithAreas);
    setChartDueDate(initialChart.due_date || null);
    const getVisionDate = (vision: VisionItem) => vision.dueDate || null;
    const visionSplit = splitItemsByDate(initialChart.visions, getVisionDate);
    setVisions([...visionSplit.datedItems, ...visionSplit.undatedItems]);

    const realitySplit = splitItemsByDate(initialChart.realities, () => null);
    setRealities([...realitySplit.datedItems, ...realitySplit.undatedItems]);

    const sortedTensions = initialChart.tensions.map((tension) => {
      const actionSplit = splitItemsByDate(
        tension.actionPlans,
        (action) => action.dueDate || null
      );
      return {
        ...tension,
        actionPlans: [...actionSplit.datedItems, ...actionSplit.undatedItems],
      };
    });
    setTensions(sortedTensions);

    const looseSplit = splitItemsByDate(
      initialChart.looseActions || [],
      (action) => action.dueDate || null
    );
    setLooseActions([...looseSplit.datedItems, ...looseSplit.undatedItems]);

  }, [chartSyncKey]);

  // スクロール位置の復元（DOM更新後・ブラウザ描画前に同期実行）
  useLayoutEffect(() => {
    if (_pendingScrollRestore !== null && _pendingScrollRestore > 0) {
      const viewport = document.querySelector('[data-nav-scope="tension-action"]')
        ?.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = _pendingScrollRestore;
      }
    }
  }, [tensions, looseActions]);

  const actionMetaById = useMemo(() => {
    const map = new Map<string, { tensionId: string | null; areaId: string | null }>();
    tensions.forEach((tension) => {
      tension.actionPlans.forEach((action) => {
        map.set(action.id, { tensionId: tension.id, areaId: action.area_id || null });
      });
    });
    looseActions.forEach((action) => {
      map.set(action.id, { tensionId: null, areaId: action.area_id || null });
    });
    return map;
  }, [tensions, looseActions]);

  const resolveTensionAreaId = (tension: Tension) => {
    if (tension.area_id) return tension.area_id;
    const visionArea = tension.visionIds
      .map((vid) => visions.find((v) => v.id === vid)?.area_id || null)
      .find((id) => id !== null);
    if (visionArea !== undefined && visionArea !== null) return visionArea;
    const realityArea = tension.realityIds
      .map((rid) => realities.find((r) => r.id === rid)?.area_id || null)
      .find((id) => id !== null);
    return realityArea ?? null;
  };

  const getVisionDate = (vision: VisionItem) => vision.dueDate || null;

  const { handleDragEnd, handleTensionDragEnd, handleActionSectionDragEnd, handleAreaDragEnd } = useDndHandlers({
    chartId,
    chart,
    setChart: setChart as React.Dispatch<React.SetStateAction<{ areas: Area[] }>>,
    visions,
    setVisions,
    realities,
    setRealities,
    tensions,
    setTensions,
    looseActions,
    setLooseActions,
    actionMetaById,
    resolveTensionAreaId,
    getVisionDate,
    router,
  });

  const groupedVisions = useMemo(() => {
    const areas = chart.areas ?? [];
    const result: Record<string, { dated: VisionItem[]; undated: VisionItem[] }> = {};
    areas.forEach((area) => {
      result[area.id] = { dated: [], undated: [] };
    });
    result.uncategorized = { dated: [], undated: [] };

    visions.forEach((vision) => {
      const areaKey =
        vision.area_id && result[vision.area_id] ? vision.area_id : "uncategorized";
      if (getVisionDate(vision)) {
        result[areaKey].dated.push(vision);
      } else {
        result[areaKey].undated.push(vision);
      }
    });

    Object.values(result).forEach((group) => {
      group.dated.sort(
        (a, b) => new Date(getVisionDate(b)!).getTime() - new Date(getVisionDate(a)!).getTime()
      );
      group.undated.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });

    return result;
  }, [visions, chart.areas]);

  const groupedRealities = useMemo(() => {
    const areas = chart.areas ?? [];
    const result: Record<string, { dated: RealityItem[]; undated: RealityItem[] }> = {};
    areas.forEach((area) => {
      result[area.id] = { dated: [], undated: [] };
    });
    result.uncategorized = { dated: [], undated: [] };

    realities.forEach((reality) => {
      const areaKey =
        reality.area_id && result[reality.area_id] ? reality.area_id : "uncategorized";
      result[areaKey].undated.push(reality);
    });

    Object.values(result).forEach((group) => {
      group.undated.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });

    return result;
  }, [realities, chart.areas]);

  const structuredData = useMemo<StructuredData>(() => {
    const getActionDate = (a: ActionPlan) => a.dueDate || null;
    const areas = (chart.areas ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (!areas || !tensions || !looseActions) {
      return {
        categorized: [],
        uncategorized: { tensions: [], orphanedActions: [] },
      };
    }

    const allActions = [
      ...looseActions,
      ...tensions.flatMap((tension) => tension.actionPlans),
    ];
    const assignedActionIds = new Set(
      tensions.flatMap((tension) => tension.actionPlans.map((action) => action.id))
    );

    const categorized = areas.map((area) => {
      const areaTensions = tensions
        .filter((tension) => tension.area_id === area.id)
        .map((tension) => ({
          ...tension,
          actions: sortItemsByFutureDateFirst(
            tension.actionPlans,
            getActionDate
          ),
        }))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const orphans = sortItemsByFutureDateFirst(
        allActions.filter(
          (action) =>
            action.area_id === area.id &&
            !action.tension_id &&
            !assignedActionIds.has(action.id)
        ),
        getActionDate
      );

      return {
        area,
        tensions: areaTensions,
        orphanedActions: orphans,
      };
    });

    const uncategorizedTensions = tensions
      .filter((tension) => !tension.area_id)
      .map((tension) => ({
        ...tension,
        actions: sortItemsByFutureDateFirst(tension.actionPlans, getActionDate),
      }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const uncategorizedOrphans = sortItemsByFutureDateFirst(
      allActions.filter(
        (action) =>
          !action.area_id && !action.tension_id && !assignedActionIds.has(action.id)
      ),
      getActionDate
    );

    return {
      categorized,
      uncategorized: {
        tensions: uncategorizedTensions,
        orphanedActions: uncategorizedOrphans,
      },
    };
  }, [chart.areas, tensions, looseActions]);

  useEffect(() => {
    console.group("📊 ZENSHIN Structured Data");

    const totalOrphans =
      structuredData.categorized.reduce(
        (sum, group) => sum + group.orphanedActions.length,
        0
      ) + structuredData.uncategorized.orphanedActions.length;

    if (totalOrphans > 0) {
      console.warn(t("orphanActionsNote"));
    }

    console.groupEnd();
  }, [structuredData]);

  const renderVisionItem = (vision: VisionItem, index: number) => (
    <SortableVisionItem
      key={vision.id}
      vision={vision}
      index={index}
      chartId={chartId}
      onUpdate={handleUpdateVision}
      onDelete={handleDeleteVision}
      areas={chart.areas || []}
      onOpenDetail={(item) => handleOpenDetailPanelForModal("vision", item.id, item.content || "")}
      onOpenFocus={(item, itemIndex) =>
        openFocusMode(
          "vision",
          item.id,
          `Vision V-${String(itemIndex + 1).padStart(2, "0")}`,
          item.content || ""
        )
      }
      onOpenAreaSettings={() => setTagManagerOpen(true)}
      currentUser={currentUser}
      workspaceMembers={workspaceMembers}
    />
  );

  const renderVisionContent = () => {
    const areas = (chart.areas ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const showAll = selectedAreaId === "all";
    const showUncategorized = selectedAreaId === "uncategorized";
    const visibleAreas = showAll ? areas : areas.filter((area) => area.id === selectedAreaId);
    const areaIds = visibleAreas.map((a) => a.id);
    const getVisionDate = (v: VisionItem) => v.dueDate || null;
    const visionItemRenderer = (vision: VisionItem, index: number) => (
      <SortableVisionItem
        key={vision.id}
        vision={vision}
        index={index}
        chartId={chartId}
        onUpdate={handleUpdateVision}
        onDelete={handleDeleteVision}
        areas={chart.areas || []}
        onOpenDetail={(item) =>
          handleOpenDetailPanelForModal("vision", item.id, item.content || "")
        }
        onOpenFocus={(item, itemIndex) =>
          openFocusMode(
            "vision",
            item.id,
            `Vision V-${String(itemIndex + 1).padStart(2, "0")}`,
            item.content || ""
          )
        }
        onOpenAreaSettings={() => setTagManagerOpen(true)}
        currentUser={currentUser}
        workspaceMembers={workspaceMembers}
      />
    );
    const inner = (
      <div className="p-0 space-y-4">
        {showAll && areaIds.length > 0 ? (
          <SortableContext items={areaIds.map((id) => `area-${id}`)} strategy={verticalListSortingStrategy}>
            {visibleAreas.map((area) => {
              const areaVisions = sortItemsByFutureDateFirst(
                visions.filter((v) => v.area_id === area.id),
                getVisionDate,
                undefined,
                true
              );
              return (
                <SortableAreaSection
                  key={area.id}
                  areaId={area.id}
                  area={area}
                  itemCount={areaVisions.length}
                  headerContent={<span className="ml-2 text-xs text-zenshin-navy/40">{t("itemCount", { count: areaVisions.length })}</span>}
                >
                  <AreaDropZone
                    areaId={area.id}
                    areaName={area.name}
                    areaColor={area.color}
                    items={areaVisions}
                    listType="vision"
                    showHeader={false}
                    renderItem={visionItemRenderer}
                  />
                </SortableAreaSection>
              );
            })}
          </SortableContext>
        ) : (
          visibleAreas.map((area) => {
            const areaVisions = sortItemsByFutureDateFirst(
              visions.filter((v) => v.area_id === area.id),
              getVisionDate,
              undefined,
              true
            );
            return (
              <div key={area.id}>
                <AreaDropZone
                  areaId={area.id}
                  areaName={area.name}
                  areaColor={area.color}
                  items={areaVisions}
                  listType="vision"
                  renderItem={visionItemRenderer}
                />
              </div>
            );
          })
        )}
        {(() => {
          if (!showAll && !showUncategorized) return null;
          const uncategorizedVisions = sortItemsByFutureDateFirst(
            visions.filter((v) => !v.area_id),
            getVisionDate,
            undefined,
            true
          );
          return (
            <div className="mt-4 first:mt-0 mb-4 last:mb-0">
              <AreaDropZone
                areaId={null}
                areaName={tTags("untagged")}
                areaColor="#9CA3AF"
                items={uncategorizedVisions}
                listType="vision"
                renderItem={visionItemRenderer}
              />
            </div>
          );
        })()}
      </div>
    );
    return inner;
  };

  const renderRealityItem = (reality: RealityItem, index: number) => (
    <SortableRealityItem
      key={reality.id}
      reality={reality}
      index={index}
      highlightedItemId={highlightedItemId}
      handleUpdateReality={handleUpdateReality}
      handleDeleteReality={handleDeleteReality}
      areas={chart.areas}
      onOpenDetail={(item) => handleOpenDetailPanelForModal("reality", item.id, item.content || "")}
      onOpenFocus={(item, itemIndex) =>
        openFocusMode(
          "reality",
          item.id,
          `Reality R-${String(itemIndex + 1).padStart(2, "0")}`,
          item.content || ""
        )
      }
      onOpenAreaSettings={() => setTagManagerOpen(true)}
      currentUser={currentUser}
      workspaceMembers={workspaceMembers}
    />
  );

  const renderRealityContent = () => {
    const areas = (chart.areas ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const showAll = selectedAreaId === "all";
    const showUncategorized = selectedAreaId === "uncategorized";
    const visibleAreas = showAll ? areas : areas.filter((area) => area.id === selectedAreaId);
    const areaIds = visibleAreas.map((a) => a.id);
    const getRealityDate = (r: RealityItem) => r.dueDate || null;
    const realityItemRenderer = (reality: RealityItem, index: number) => (
      <SortableRealityItem
        key={reality.id}
        reality={reality}
        index={index}
        highlightedItemId={highlightedItemId}
        handleUpdateReality={handleUpdateReality}
        handleDeleteReality={handleDeleteReality}
        areas={chart.areas}
        onOpenDetail={(item) =>
          handleOpenDetailPanelForModal("reality", item.id, item.content || "")
        }
        onOpenFocus={(item, itemIndex) =>
          openFocusMode(
            "reality",
            item.id,
            `Reality R-${String(itemIndex + 1).padStart(2, "0")}`,
            item.content || ""
          )
        }
        onOpenAreaSettings={() => setTagManagerOpen(true)}
        currentUser={currentUser}
        workspaceMembers={workspaceMembers}
      />
    );
    const renderAreaRealities = (areaRealities: RealityItem[]) => (
      <div className="space-y-1 transition-all min-h-[40px]">
        <SortableContext items={areaRealities.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {areaRealities.length === 0 ? (
            <div className="text-zenshin-navy/40 text-sm py-2 px-1 select-none opacity-60">
              {t("noItems")}
            </div>
          ) : (
            areaRealities.map((reality, index) => realityItemRenderer(reality, index))
          )}
        </SortableContext>
      </div>
    );
    return (
      <div className="p-0 space-y-4">
        {showAll && areaIds.length > 0 ? (
          <SortableContext items={areaIds.map((id) => `area-${id}`)} strategy={verticalListSortingStrategy}>
            {visibleAreas.map((area) => {
              const areaRealities = sortItemsByFutureDateFirst(
                realities.filter((r) => r.area_id === area.id),
                getRealityDate
              );
              return (
                <SortableAreaSection
                  key={area.id}
                  areaId={area.id}
                  area={area}
                  itemCount={areaRealities.length}
                  headerContent={<span className="ml-2 text-xs text-zenshin-navy/40">{t("itemCount", { count: areaRealities.length })}</span>}
                >
                  {renderAreaRealities(areaRealities)}
                </SortableAreaSection>
              );
            })}
          </SortableContext>
        ) : (
          visibleAreas.map((area) => {
            const areaRealities = sortItemsByFutureDateFirst(
              realities.filter((r) => r.area_id === area.id),
              getRealityDate
            );
            return (
              <div key={area.id}>
                <div className="flex items-center mb-2">
                  <span
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: area.color }}
                  />
                  <span className="text-sm font-bold text-zenshin-navy">{area.name}</span>
                  <span className="ml-2 text-xs text-zenshin-navy/40">{t("itemCount", { count: areaRealities.length })}</span>
                </div>
                {renderAreaRealities(areaRealities)}
              </div>
            );
          })
        )}
        {(() => {
          if (!showAll && !showUncategorized) return null;
          const uncategorizedRealities = sortItemsByFutureDateFirst(
            realities.filter((r) => !r.area_id),
            getRealityDate
          );
          return (
            <div>
              <div className="flex items-center mb-2">
                <span className="w-3 h-3 rounded-full mr-2 bg-gray-400" />
                <span className="text-sm font-bold text-zenshin-navy">{tTags("untagged")}</span>
                <span className="ml-2 text-xs text-zenshin-navy/40">
                  {t("itemCount", { count: uncategorizedRealities.length })}
                </span>
              </div>
              <div className="space-y-1 transition-all min-h-[40px]">
                <SortableContext
                  items={uncategorizedRealities.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {uncategorizedRealities.length === 0 ? (
                    <div className="text-zenshin-navy/40 text-sm py-2 px-1 select-none opacity-60">
                      {t("noItems")}
                    </div>
                  ) : (
                    uncategorizedRealities.map((reality, index) => realityItemRenderer(reality, index))
                  )}
                </SortableContext>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // エリア作成ハンドラ
  const handleCreateArea = async (name: string, color: string): Promise<Area | null> => {
    const newArea = await addArea(chartId, name, color);
    if (newArea) {
      router.refresh();
    }
    return newArea;
  };

  // エリア更新ハンドラ
  const handleUpdateArea = async (
    areaId: string,
    updates: Partial<Pick<Area, "name" | "color">>
  ) => {
    const success = await updateAreaItem(areaId, chartId, updates);
    if (success) {
      router.refresh();
    }
  };

  // エリア削除ハンドラ
  const handleDeleteArea = async (areaId: string) => {
    const success = await removeArea(areaId, chartId);
    if (success) {
      router.refresh();
    }
  };

  // 子チャートの進捗情報を取得
  useEffect(() => {
    const fetchProgress = async () => {
      const progressMap: Record<string, { total: number; completed: number; percentage: number }> = {};
      
      for (const tension of tensions) {
        for (const actionPlan of tension.actionPlans) {
          if (actionPlan.childChartId) {
            const progress = await getActionProgress(actionPlan.childChartId);
            if (progress) {
              progressMap[actionPlan.id] = progress;
            }
          }
        }
      }
      
      setActionProgress(progressMap);
    };

    fetchProgress();
  }, [tensions]);

  const getVisionById = (id: string) => visions.find((v) => v.id === id);
  const getRealityById = (id: string) => realities.find((r) => r.id === id);

  const hasChildCharts =
    looseActions.some((a) => a.childChartId) ||
    tensions.some((t) => t.actionPlans?.some((a) => a.childChartId));

  const handleCreateSnapshot = async () => {
    if (isSavingSnapshot) return;
    setSnapshotDropdownOpen(false);
    setIsSavingSnapshot(true);
    try {
      const result = await createSnapshot(chartId, undefined, "manual");
      if (result.success) {
        toast.success(tt("snapshotSaved"), { duration: 3000 });
      } else {
        toast.error(tt("snapshotSaveFailed", { error: tt(result.error ?? "unknownError") }), { duration: 5000 });
      }
    } catch (error) {
      console.error("[handleCreateSnapshot] エラー:", error);
      toast.error(tt("snapshotError"), { duration: 5000 });
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleTreeSnapshot = async () => {
    if (isSavingSnapshot) return;
    setSnapshotDropdownOpen(false);
    setIsSavingSnapshot(true);
    try {
      const wsId = chart?.workspace_id ?? workspaceId ?? null;
      const result = await createTreeSnapshot(chartId, wsId);
      if (result.success) {
        toast.success(tt("treeSnapshotSuccess"), { duration: 3000 });
      } else {
        toast.error(tt("snapshotSaveFailed", { error: tt(result.error ?? "unknownError") }), { duration: 5000 });
      }
    } catch (error) {
      console.error("[handleTreeSnapshot] エラー:", error);
      toast.error(tt("treeSnapshotError"), { duration: 5000 });
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (snapshotDropdownRef.current && !snapshotDropdownRef.current.contains(e.target as Node)) {
        setSnapshotDropdownOpen(false);
      }
    };
    if (snapshotDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [snapshotDropdownOpen]);

  // Fetch pending proposals count
  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const res = await fetch(`/api/proposals/list?chartId=${chartId}&status=pending`);
        const data = await res.json();
        setPendingProposalsCount(data.proposals?.length ?? 0);
      } catch {
        // silently ignore
      }
    };
    fetchPendingCount();
  }, [chartId]);

  const handleArchiveChart = async () => {
    if (!chart?.id) return;
    setArchiveChartDialogOpen(false);
    setIsChartMenuLoading(true);
    try {
      const result = await archiveChart(chart.id);
      removeChartFromRecent(chart.id, chart.workspace_id);
      toast.success(tt("chartsArchived", { count: result.archivedCount }), {
        duration: 3000,
        action: {
          label: t("restoreView"),
          onClick: async () => {
            await restoreChart(chart.id);
            toast.success(tt("archiveRestored"), { duration: 3000 });
            router.refresh();
          },
        },
      });
      if (chart.parentChartId) {
        router.push(`/charts/${chart.parentChartId}`);
      } else {
        router.push("/charts");
      }
    } catch (error) {
      console.error("Failed to archive:", error);
      toast.error(tt("archiveFailed"), { duration: 5000 });
    } finally {
      setIsChartMenuLoading(false);
    }
  };

  const handleDeleteChart = async () => {
    if (!chart?.id) return;
    setDeleteChartDialogOpen(false);
    setIsChartMenuLoading(true);
    try {
      await deleteChart(chart.id);
      removeChartFromRecent(chart.id, chart.workspace_id);
      toast.success(tt("chartDeleted"), { duration: 3000 });
      if (chart.parentChartId) {
        router.push(`/charts/${chart.parentChartId}`);
      } else {
        router.push("/charts");
      }
    } catch (error) {
      console.error("Failed to delete:", error);
      toast.error(tt("deleteFailed"), { duration: 5000 });
    } finally {
      setIsChartMenuLoading(false);
    }
  };

  const handleUpdateChartDueDate = async (dueDate: string | null) => {
    try {
      const success = await updateChartData(chartId, { due_date: dueDate });
      if (!success) {
        console.error("[handleUpdateChartDueDate] Update failed");
        return;
      }

      setChart((prev) => ({ ...prev, due_date: dueDate }));
      setChartDueDate(dueDate);

      // 親アクションの日付も同期（子→親）
      if (chart.parentActionId) {
        const { error: parentError } = await supabase
          .from("actions")
          .update({
            due_date: dueDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", chart.parentActionId);
        if (parentError) {
          console.error("[handleUpdateChartDueDate] parent action sync error:", parentError);
        }
      }
    } catch (err) {
      console.error("[handleUpdateChartDueDate] Exception:", err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zenshin-cream">
      {/* アーカイブ確認ダイアログ */}
      <AlertDialog open={archiveChartDialogOpen} onOpenChange={setArchiveChartDialogOpen}>
        <AlertDialogContent className="rounded-2xl border-gray-200 shadow-xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-zenshin-navy">
              {t("archiveChartConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              {t("archiveChartDescription", { title: chart?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg px-4 py-2 text-sm">
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg px-4 py-2 text-sm bg-zenshin-navy text-white hover:bg-zenshin-navy/90"
              onClick={handleArchiveChart}
            >
              {t("archiveConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 完全削除確認ダイアログ */}
      <AlertDialog open={deleteChartDialogOpen} onOpenChange={setDeleteChartDialogOpen}>
        <AlertDialogContent className="rounded-2xl border-gray-200 shadow-xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-zenshin-navy">
              {t("deleteChartConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              {t("deleteChartWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg px-4 py-2 text-sm">
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600"
              onClick={handleDeleteChart}
            >
              {t("deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ヘッダー */}
      <header className="border-b border-zenshin-navy/10 bg-zenshin-cream sticky top-0 z-10">
        {/* 上段: パンくず & アクション */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zenshin-navy/5">
          <nav className="flex items-center gap-2 text-sm text-zenshin-navy/50">
            <Link href="/charts" className="hover:text-zenshin-navy transition-colors">
              <Home className="w-4 h-4" />
            </Link>
            <ChevronRight className="w-4 h-4 text-zenshin-navy/30" />
            {(() => {
              const breadcrumbItems = breadcrumbs.filter((crumb) => crumb.id !== "root");
              if (breadcrumbItems.length === 0) {
                return (
                  <span className="text-zenshin-navy font-medium truncate max-w-[200px]">
                    {chart.title}
                  </span>
                );
              }
              return breadcrumbItems.map((crumb, index) => {
                const isLast = index === breadcrumbItems.length - 1;
                const isCurrentChart =
                  crumb.id === chartId && (crumb.type === "chart" || !crumb.type);
                const isClickable =
                  !isLast && !isCurrentChart && (crumb.type === "chart" || !crumb.type);

                return (
                  <div key={`${crumb.id}-${index}`} className="flex items-center gap-2 shrink-0">
                    {isClickable ? (
                      <Link
                        href={`/charts/${crumb.id}`}
                        className="hover:text-zenshin-navy transition-colors truncate max-w-[150px]"
                      >
                        {crumb.title}
                      </Link>
                    ) : (
                      <span
                        className={`truncate max-w-[200px] ${
                          isLast || isCurrentChart ? "text-zenshin-navy font-medium" : "text-zenshin-navy/50"
                        }`}
                      >
                        {crumb.title}
                      </span>
                    )}
                    {!isLast && <ChevronRight className="w-4 h-4 text-zenshin-navy/30" />}
                  </div>
                );
              });
            })()}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 relative"
              onClick={() => setIsProposalsPanelOpen(true)}
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Proposals
              {pendingProposalsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingProposalsCount}
                </span>
              )}
            </Button>
            <div className="relative" ref={snapshotDropdownRef}>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={isSavingSnapshot}
                onClick={() => {
                  if (hasChildCharts) {
                    setSnapshotDropdownOpen((prev) => !prev);
                  } else {
                    handleCreateSnapshot();
                  }
                }}
              >
                {isSavingSnapshot ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-1.5" />
                )}
                Snapshot
              </Button>
              {hasChildCharts && snapshotDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-white rounded-lg shadow-lg border border-slate-200">
                  <button
                    type="button"
                    className="w-full px-4 py-3 hover:bg-slate-50 cursor-pointer text-left text-sm flex items-center gap-2 border-b border-slate-100"
                    onClick={handleCreateSnapshot}
                  >
                    <span>📷</span>
                    {tt("snapshotSingle")}
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 hover:bg-slate-50 cursor-pointer text-left text-sm flex items-center gap-2"
                    onClick={handleTreeSnapshot}
                  >
                    <span>🌳</span>
                    {tt("snapshotTree")}
                  </button>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isChartMenuLoading}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={async () => {
                    const newStatus = chart.status === "completed" ? "active" : "completed";
                    const result = await updateChartStatusAction(chartId, newStatus);
                    if (result.error) {
                      toast.error(tt("statusUpdateFailed"), { duration: 5000 });
                    } else {
                      setChart((prev) => ({ ...prev, status: newStatus }));
                      toast.success(
                        newStatus === "completed" ? tt("chartCompleted") : tt("chartReopened"),
                        { duration: 3000 }
                      );
                    }
                  }}
                  className="gap-2"
                >
                  {chart.status === "completed" ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      {t("chartReopen")}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {t("chartComplete")}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setArchiveChartDialogOpen(true)}
                  className="gap-2"
                >
                  <Archive className="w-4 h-4" />
                  {tSidebar("archive")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleteChartDialogOpen(true)}
                  className="gap-2 text-red-600 focus:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                  {tc("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 中段: タイトル */}
        <div className="px-6 py-4 flex items-center gap-2 flex-wrap">
          <input
            type="text"
            {...chartTitleInput.bind}
            className="text-2xl font-bold text-zenshin-navy bg-transparent border-none outline-none w-full hover:bg-zenshin-cream focus:bg-zenshin-cream rounded px-1 -ml-1 transition-colors min-w-0"
            placeholder={t("chartTitlePlaceholder")}
          />
          {chart.status === "completed" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              {tk("done")}
            </span>
          )}
        </div>

        {/* 下段: メタデータ & フィルター */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-50/50 border-t border-zenshin-navy/5">
          <div className="flex items-center gap-1.5">
            <Popover open={chartDueDateOpen} onOpenChange={setChartDueDateOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zenshin-navy/70 hover:text-zenshin-navy hover:bg-white/60 rounded-lg transition-colors cursor-pointer">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>
                    {chartDueDate
                      ? format(new Date(chartDueDate), "yyyy/MM/dd")
                      : t("noDueDate")}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                <CalendarComponent
                  mode="single"
                  selected={chartDueDate ? new Date(chartDueDate) : undefined}
                  onSelect={(date) => {
                    handleUpdateChartDueDate(date ? date.toISOString() : null);
                    setChartDueDateOpen(false);
                  }}
                  initialFocus
                />
                {chartDueDate && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-zenshin-navy/50 hover:text-red-500"
                      onClick={() => { handleUpdateChartDueDate(null); setChartDueDateOpen(false); }}
                    >
                      {tAction("clearDueDate")}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <div className="h-3.5 w-px bg-gray-200" />

            <Select value={selectedAreaId || "all"} onValueChange={(value) => setSelectedAreaId(value)}>
              <SelectTrigger className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zenshin-navy/70 hover:text-zenshin-navy hover:bg-white/60 rounded-lg transition-colors cursor-pointer border-0 shadow-none bg-transparent h-auto w-auto justify-start min-w-0">
                <SelectValue placeholder={t("allTags")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTags")}</SelectItem>
                <SelectItem value="uncategorized">{tTags("untagged")}</SelectItem>
                {chart.areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: area.color }}
                      />
                      {area.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="h-3.5 w-px bg-gray-200" />

            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zenshin-navy/70 hover:text-zenshin-navy hover:bg-white/60 rounded-lg transition-colors cursor-pointer"
              onClick={() => setTagManagerOpen(true)}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{tTags("tagSettings")}</span>
            </button>
          </div>

          {/* モード切替トグル */}
          <div className="flex items-center bg-gray-100 rounded-full p-0.5">
            <button
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                viewMode === "default"
                  ? "bg-zenshin-orange text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-200"
              }`}
              onClick={() => setViewMode("default")}
            >
              {t("standardMode")}
            </button>
            <button
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                viewMode === "comparison"
                  ? "bg-zenshin-orange text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-200"
              }`}
              onClick={() => setViewMode("comparison")}
            >
              {t("comparisonMode")}
            </button>
          </div>
        </div>
      </header>

      <TagManager
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        areas={chart.areas}
        onCreateArea={handleCreateArea}
        onUpdateArea={handleUpdateArea}
        onDeleteArea={handleDeleteArea}
      />

      {/* メインエリア */}
      <div className="flex-1 overflow-hidden bg-zenshin-cream">
        {visions.length === 0 &&
          realities.length === 0 &&
          tensions.length === 0 &&
          looseActions.length === 0 && (
            <div className="px-6 pt-6">
              <WelcomeCard
                chartId={chartId}
                onStructurized={() => router.refresh()}
              />
            </div>
          )}
        {focusedArea ? (
          <div className="h-full p-6">
            {focusedArea === "vision" && (
              <div className="h-full">
                <div
                  className={`flex flex-col p-4 bg-white border-2 rounded-lg shadow-sm h-full transition-all duration-200 ${
                    hoveredSection === "vision"
                      ? "border-zenshin-teal shadow-md shadow-zenshin-teal/20"
                      : "border-zenshin-teal/50"
                  }`}
                >
                  <div className="pt-2 pb-2 mb-3 border-b bg-zenshin-teal/10 flex items-center justify-between rounded-t-lg -mx-4 -mt-4 px-4 pt-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-zenshin-teal" />
                      <h2 className="text-base font-bold text-zenshin-navy leading-tight">{t("vision")}</h2>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-zenshin-navy/15 rounded transition-colors"
                      onClick={() => setFocusedArea(null)}
                    >
                      <Minimize2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 overflow-auto">
                    <DndContext
                      id="dnd-context-vision"
                      sensors={sensors}
                      collisionDetection={customCollisionDetection}
                      onDragEnd={(e) => {
                      if (String(e.active.id).startsWith("area-")) {
                        handleAreaDragEnd(e);
                      } else {
                        handleDragEnd(e, "visions");
                      }
                    }}
                    >
                      <div id="vision-list-container" className="space-y-0" data-nav-scope="vision">
                        {renderVisionContent()}
                      </div>
                    </DndContext>
                  </ScrollArea>
                  <div className="mt-3 py-1.5 px-2 border-t bg-white shrink-0">
                    <div className="flex gap-2">
                      <Input
                        {...newVisionInput.bind}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddVision(newVisionInput.value);
                            return;
                          }
                          newVisionInput.handleKeyDown(e);
                        }}
                        placeholder={t("addNewVisionPlaceholder")}
                        className="text-sm h-7 flex-1"
                        disabled={isSubmittingVision}
                      />
                      <Button
                        onClick={() => handleAddVision(newVisionInput.value)}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        disabled={!newVisionInput.value.trim() || isSubmittingVision}
                      >
                        {isSubmittingVision ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {focusedArea === "reality" && (
              <div className="h-full">
                <div
                  className={`flex flex-col p-4 bg-white border-2 rounded-lg shadow-sm h-full overflow-hidden transition-all duration-200 ${
                    hoveredSection === "reality"
                      ? "border-zenshin-orange shadow-md shadow-zenshin-orange/20"
                      : "border-zenshin-orange/50"
                  }`}
                >
                  <div className="pt-2 pb-2 mb-3 border-b bg-zenshin-orange/10 flex items-center justify-between rounded-t-lg shrink-0 -mx-4 -mt-4 px-4 pt-4">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-zenshin-orange" />
                      <h2 className="text-base font-bold text-foreground leading-tight">
                        {t("reality")}
                      </h2>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-zenshin-navy/15 rounded transition-colors"
                      onClick={() => setFocusedArea(null)}
                    >
                      <Minimize2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 overflow-auto">
                    <DndContext
                      id="dnd-context-reality-focused"
                      sensors={sensors}
                      collisionDetection={customCollisionDetection}
                      onDragEnd={(e) => {
                      if (String(e.active.id).startsWith("area-")) {
                        handleAreaDragEnd(e);
                      } else {
                        handleDragEnd(e, "realities");
                      }
                    }}
                    >
                      <div
                        id="reality-list-container"
                        className="space-y-0"
                        data-nav-scope="reality"
                      >
                        {renderRealityContent()}
                      </div>
                    </DndContext>
                  </ScrollArea>
                  <div className="mt-3 py-1.5 px-2 border-t bg-white shrink-0">
                    <div className="flex gap-2">
                      <Input
                        {...newRealityInput.bind}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddReality(newRealityInput.value);
                            return;
                          }
                          newRealityInput.handleKeyDown(e);
                        }}
                        placeholder={t("addNewRealityPlaceholder")}
                        className="text-sm h-7 flex-1"
                        disabled={isSubmittingReality}
                      />
                      <Button
                        onClick={() => handleAddReality(newRealityInput.value)}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        disabled={
                          !newRealityInput.value.trim() || isSubmittingReality
                        }
                      >
                        {isSubmittingReality ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {focusedArea === "tension" && (
              <div className="h-full">
                <div
                  className={`flex flex-col bg-white border-2 rounded-lg shadow-sm h-full overflow-hidden transition-all duration-200 ${
                    hoveredSection === "tension"
                      ? "border-zenshin-navy shadow-md shadow-zenshin-navy/20"
                      : "border-zenshin-navy/30"
                  }`}
                >
                  <div className="px-3 pt-2 pb-3 border-b bg-zenshin-navy/8 flex items-center justify-between rounded-t-lg shrink-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-zenshin-navy" />
                      <h2 className="text-base font-bold text-foreground leading-tight">
                        {t("tensionAndAction")}
                      </h2>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-6 w-6 rounded transition-colors ${
                          sortByStatus
                            ? "bg-zenshin-navy/15 text-zenshin-navy"
                            : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        }`}
                        onClick={() => setSortByStatus(!sortByStatus)}
                        title={t("sortByStatusTitle")}
                      >
                        <ArrowUpDown className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-6 w-6 rounded transition-colors ${
                          hideCompleted
                            ? "bg-zenshin-orange/15 text-zenshin-orange"
                            : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        }`}
                        onClick={() => setHideCompleted(!hideCompleted)}
                        title={hideCompleted ? t("showCompleted") : t("hideCompletedTitle")}
                      >
                        {hideCompleted ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        onClick={() => setFocusedArea(null)}
                        title={t("restoreView")}
                      >
                        <Minimize2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-3 space-y-4" data-nav-scope="tension-action">
                      {(() => {
                        const areaOrder =
                          selectedAreaId === "all"
                            ? [...chart.areas.map((area) => area.id), null]
                            : selectedAreaId === "uncategorized"
                              ? [null]
                              : [selectedAreaId];

                        const allCompletedTensions: Tension[] = [];
                        areaOrder.forEach((areaId) => {
                          const group = areaId
                            ? structuredData.categorized.find(
                                (g) => g.area.id === areaId
                              )
                            : structuredData.uncategorized;
                          const tensions = group ? group.tensions : [];
                          allCompletedTensions.push(
                            ...tensions.filter((t) => isTensionCompleted(t))
                          );
                        });

                        return (
                          <DndContext
                            id="dnd-context-action-focused"
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleTensionDragEnd}
                          >
                            <TensionDragOverlay
                              tensions={tensions}
                              areas={chart.areas}
                              chartId={chartId}
                              handleUpdateTension={handleUpdateTension}
                              handleDeleteTension={handleDeleteTension}
                              handleUpdateActionPlan={handleUpdateActionPlan}
                              handleDeleteActionPlan={handleDeleteActionPlan}
                              handleTelescopeClick={handleTelescopeClick}
                              telescopingActionId={telescopingActionId}
                              currentUser={currentUser}
                              onOpenDetailPanel={handleOpenDetailPanelForModal}
                              onAddAction={handleAddActionPlan}
                              isSubmittingAction={isSubmittingAction}
                              handleOptimisticMove={handleOptimisticMove}
                              workspaceMembers={workspaceMembers}
                            />
                            <div className="space-y-4">
                              {areaOrder.map((areaId) => {
                                const area = areaId
                                  ? chart.areas.find((a) => a.id === areaId)
                                  : null;
                                const areaName = area ? area.name : tTags("untagged");
                                const areaColor = area ? area.color : "#9CA3AF";
                                const group = areaId
                                  ? structuredData.categorized.find(
                                      (g) => g.area.id === areaId
                                    )
                                  : structuredData.uncategorized;

                                const tensionsInSection = group ? group.tensions : [];
                                const activeTensions = tensionsInSection.filter(
                                  (t) => !isTensionCompleted(t)
                                );
                                const looseActionsInSection = group
                                  ? group.orphanedActions
                                  : [];

                                return (
                                  <ActionSection
                                    key={areaId || "uncategorized"}
                                    areaId={areaId}
                                    areaName={areaName}
                                    areaColor={areaColor}
                                    tensionsInSection={activeTensions}
                                    looseActions={looseActionsInSection}
                                    allTensions={tensions}
                                    handleOptimisticMove={handleOptimisticMove}
                                    handleUpdateActionPlan={handleUpdateActionPlan}
                                    handleDeleteActionPlan={handleDeleteActionPlan}
                                    handleTelescopeClick={handleTelescopeClick}
                                    telescopingActionId={telescopingActionId}
                                    currentUser={currentUser}
                                    areas={chart.areas}
                                    chartId={chartId}
                                    onOpenDetailPanel={handleOpenDetailPanelForModal}
                                    getSortedAndNumberedActions={
                                      getSortedAndNumberedActions
                                    }
                                    isSubmittingAction={isSubmittingAction}
                                    onAddAction={handleAddActionPlan}
                                    onAddTension={handleAddTension}
                                    visions={visions}
                                    realities={realities}
                                    toggleVisionRealityLink={toggleVisionRealityLink}
                                    setHighlightedItemId={setHighlightedItemId}
                                    handleUpdateTension={handleUpdateTension}
                                    handleDeleteTension={handleDeleteTension}
                                    onMoveTensionArea={handleMoveTensionArea}
                                    onOpenFocus={(tension) => {
                                      openFocusMode(
                                        "tension",
                                        tension.id,
                                        tension.title || "Tension",
                                        tension.title || ""
                                      );
                                    }}
                                    sortByStatus={sortByStatus}
                                    hideCompleted={hideCompleted}
                                    expandedCompletedTensions={expandedCompletedTensions}
                                    toggleCompletedTensionExpand={toggleCompletedTensionExpand}
                                    workspaceMembers={workspaceMembers}
                                  />
                                );
                              })}
                              {allCompletedTensions.length > 0 && (
                                <div className="border-t border-gray-100 mt-2">
                                  <button
                                    type="button"
                                    className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-sm text-gray-400 hover:text-gray-600 transition-colors"
                                    onClick={() =>
                                      setShowCompletedTensions(!showCompletedTensions)
                                    }
                                  >
                                    {showCompletedTensions ? (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                    {t("completedTensions", { count: allCompletedTensions.length })}
                                  </button>
                                  {showCompletedTensions && (
                                    <div className="opacity-60">
                                      {allCompletedTensions.map((tension) => (
                                        <TensionGroup
                                          key={tension._stableKey ?? tension.id}
                                          tension={tension}
                                          tensionIndex={0}
                                          areaId={tension.area_id ?? null}
                                          allTensions={tensions}
                                          handleOptimisticMove={handleOptimisticMove}
                                          handleUpdateTension={handleUpdateTension}
                                          handleDeleteTension={handleDeleteTension}
                                          onMoveTensionArea={handleMoveTensionArea}
                                          handleUpdateActionPlan={
                                            handleUpdateActionPlan
                                          }
                                          handleDeleteActionPlan={
                                            handleDeleteActionPlan
                                          }
                                          handleTelescopeClick={
                                            handleTelescopeClick
                                          }
                                          telescopingActionId={telescopingActionId}
                                          currentUser={currentUser}
                                          areas={chart.areas}
                                          chartId={chartId}
                                          onOpenDetailPanel={handleOpenDetailPanelForModal}
                                          onAddAction={handleAddActionPlan}
                                          isSubmittingAction={isSubmittingAction}
                                          onOpenFocus={(t) =>
                                            openFocusMode(
                                              "tension",
                                              t.id,
                                              t.title || "Tension",
                                              t.title || ""
                                            )
                                          }
                                          sortByStatus={sortByStatus}
                                          hideCompleted={hideCompleted}
                                          expandedCompletedTensions={expandedCompletedTensions}
                                          toggleCompletedTensionExpand={toggleCompletedTensionExpand}
                                          workspaceMembers={workspaceMembers}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </DndContext>
                        );
                      })()}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        ) : viewMode === "comparison" ? (
          <ComparisonView
            visions={visions}
            realities={realities}
            tensions={tensions}
            looseActions={looseActions}
            areas={chart.areas ?? []}
            selectedAreaFilter={selectedAreaId}
            structuredData={structuredData}
            chartId={chartId}
            sensors={sensors}
            onTensionDragEnd={handleTensionDragEnd}
            onVisionRealityDragEnd={handleDragEnd}
            handleUpdateVision={handleUpdateVision}
            handleDeleteVision={handleDeleteVision}
            handleAddVision={handleAddVision}
            handleUpdateReality={handleUpdateReality}
            handleDeleteReality={handleDeleteReality}
            handleAddReality={handleAddReality}
            isSubmittingVision={isSubmittingVision}
            isSubmittingReality={isSubmittingReality}
            handleUpdateActionPlan={handleUpdateActionPlan}
            handleDeleteActionPlan={handleDeleteActionPlan}
            handleTelescopeClick={handleTelescopeClick}
            telescopingActionId={telescopingActionId}
            currentUser={currentUser}
            onOpenDetailPanel={handleOpenDetailPanelForModal}
            onOpenAreaSettings={() => setTagManagerOpen(true)}
            highlightedItemId={highlightedItemId}
            onOpenFocusVision={(item, itemIndex) =>
              openFocusMode(
                "vision",
                item.id,
                `Vision V-${String(itemIndex + 1).padStart(2, "0")}`,
                item.content || ""
              )
            }
            onOpenFocusReality={(item, itemIndex) =>
              openFocusMode(
                "reality",
                item.id,
                `Reality R-${String(itemIndex + 1).padStart(2, "0")}`,
                item.content || ""
              )
            }
            getSortedAndNumberedActions={getSortedAndNumberedActions}
            isSubmittingAction={isSubmittingAction}
            onAddAction={handleAddActionPlan}
            onAddTension={handleAddTension}
            toggleVisionRealityLink={toggleVisionRealityLink}
            setHighlightedItemId={setHighlightedItemId}
            handleUpdateTension={handleUpdateTension}
            handleDeleteTension={handleDeleteTension}
            onOpenFocusTension={(t) =>
              openFocusMode("tension", t.id, t.title || "Tension", t.title || "")
            }
            workspaceMembers={workspaceMembers}
            sortByStatus={sortByStatus}
            setSortByStatus={setSortByStatus}
            hideCompleted={hideCompleted}
            setHideCompleted={setHideCompleted}
            showCompletedTensions={showCompletedTensions}
            setShowCompletedTensions={setShowCompletedTensions}
            isTensionCompleted={isTensionCompleted}
            expandedCompletedTensions={expandedCompletedTensions}
            toggleCompletedTensionExpand={toggleCompletedTensionExpand}
            handleOptimisticMove={handleOptimisticMove}
            onMoveTensionArea={handleMoveTensionArea}
          />
        ) : (
          <div className="h-full flex gap-4 overflow-hidden">
            {/* Left Panel: Context Source (Vision + Reality) */}
            <div className="w-1/2 h-full p-6 flex flex-col gap-4 overflow-hidden">
              {/* Vision Area - 50% */}
              <div className="flex-1 min-h-0">
                <div
                  className={`h-full flex flex-col p-4 bg-white border-2 rounded-lg shadow-sm overflow-hidden transition-all duration-200 ${
                    hoveredSection === "vision"
                      ? "border-zenshin-teal shadow-md shadow-zenshin-teal/20"
                      : "border-zenshin-teal/50"
                  }`}
                >
                  <div className="pt-2 pb-2 mb-3 border-b bg-zenshin-teal/10 flex items-center justify-between rounded-t-lg -mx-4 -mt-4 px-4 pt-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-zenshin-teal" />
                      <h2 className="text-base font-bold text-zenshin-navy leading-tight">{t("vision")}</h2>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-zenshin-teal/15 hover:text-zenshin-teal rounded transition-colors"
                      onClick={() =>
                        setFocusedArea(focusedArea === "vision" ? null : "vision")
                      }
                      onMouseEnter={() => setHoveredSection("vision")}
                      onMouseLeave={() => setHoveredSection(null)}
                    >
                      {focusedArea === "vision" ? (
                        <Minimize2 className="w-3 h-3" />
                      ) : (
                        <Maximize2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 overflow-auto">
                    <DndContext
                      id="dnd-context-vision-focused"
                      sensors={sensors}
                      collisionDetection={customCollisionDetection}
                      onDragEnd={(e) => {
                      if (String(e.active.id).startsWith("area-")) {
                        handleAreaDragEnd(e);
                      } else {
                        handleDragEnd(e, "visions");
                      }
                    }}
                    >
                      <div id="vision-list-container" className="space-y-0" data-nav-scope="vision">
                        {renderVisionContent()}
                      </div>
                    </DndContext>
                  </ScrollArea>
                  <div className="mt-3 py-1.5 px-2 border-t bg-white shrink-0">
                    <div className="flex gap-2">
                      <Input
                        {...newVisionInput.bind}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddVision(newVisionInput.value);
                            return;
                          }
                          newVisionInput.handleKeyDown(e);
                        }}
                        placeholder={t("addNewVisionPlaceholder")}
                        className="text-sm h-7 flex-1"
                        disabled={isSubmittingVision}
                      />
                      <Button
                        onClick={() => handleAddVision(newVisionInput.value)}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        disabled={!newVisionInput.value.trim() || isSubmittingVision}
                      >
                        {isSubmittingVision ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Reality Area - 50% */}
              <div className="flex-1 min-h-0">
                <div
                  className={`h-full flex flex-col p-4 bg-white border-2 rounded-lg shadow-sm overflow-hidden transition-all duration-200 ${
                    hoveredSection === "reality"
                      ? "border-zenshin-orange shadow-md shadow-zenshin-orange/20"
                      : "border-zenshin-orange/50"
                  }`}
                >
                  <div className="pt-2 pb-2 mb-3 border-b bg-zenshin-orange/10 flex items-center justify-between rounded-t-lg shrink-0 -mx-4 -mt-4 px-4 pt-4">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-zenshin-orange" />
                      <h2 className="text-base font-bold text-zenshin-navy leading-tight">{t("reality")}</h2>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-zenshin-orange/15 hover:text-zenshin-orange rounded transition-colors"
                      onClick={() =>
                        setFocusedArea(focusedArea === "reality" ? null : "reality")
                      }
                      onMouseEnter={() => setHoveredSection("reality")}
                      onMouseLeave={() => setHoveredSection(null)}
                    >
                      {focusedArea === "reality" ? (
                        <Minimize2 className="w-3 h-3" />
                      ) : (
                        <Maximize2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 overflow-auto">
                    <DndContext
                      id="dnd-context-reality"
                      sensors={sensors}
                      collisionDetection={customCollisionDetection}
                      onDragEnd={(e) => {
                      if (String(e.active.id).startsWith("area-")) {
                        handleAreaDragEnd(e);
                      } else {
                        handleDragEnd(e, "realities");
                      }
                    }}
                    >
                      <div id="reality-list-container" className="space-y-0" data-nav-scope="reality">
                        {renderRealityContent()}
                      </div>
                    </DndContext>
                  </ScrollArea>
                  <div className="mt-3 py-1.5 px-2 border-t bg-white shrink-0">
                    <div className="flex gap-2">
                      <Input
                        {...newRealityInput.bind}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddReality(newRealityInput.value);
                            return;
                          }
                          newRealityInput.handleKeyDown(e);
                        }}
                        placeholder={t("addNewRealityPlaceholder")}
                        className="text-sm h-7 flex-1"
                        disabled={isSubmittingReality}
                      />
                      <Button
                        onClick={() => handleAddReality(newRealityInput.value)}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        disabled={!newRealityInput.value.trim() || isSubmittingReality}
                      >
                        {isSubmittingReality ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Tension & Action - 50% */}
            <div className="w-1/2 h-full p-6 overflow-hidden">
              <div
                className={`flex flex-col bg-white border-2 rounded-lg shadow-sm h-full overflow-hidden transition-all duration-200 ${
                  hoveredSection === "tension"
                    ? "border-zenshin-navy shadow-md shadow-zenshin-navy/20"
                    : "border-zenshin-navy/30"
                }`}
              >
                <div className="px-3 pt-2 pb-3 border-b bg-zenshin-navy/8 flex items-center justify-between rounded-t-lg shrink-0">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-zenshin-navy" />
                    <h2 className="text-base font-bold text-zenshin-navy leading-tight">{t("tensionAndAction")}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`h-6 w-6 rounded transition-colors ${
                        sortByStatus
                          ? "bg-zenshin-navy/15 text-zenshin-navy"
                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      }`}
                      onClick={() => setSortByStatus(!sortByStatus)}
                      title={t("sortByStatusTitle")}
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`h-6 w-6 rounded transition-colors ${
                        hideCompleted
                          ? "bg-zenshin-orange/15 text-zenshin-orange"
                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      }`}
                      onClick={() => setHideCompleted(!hideCompleted)}
                      title={hideCompleted ? t("showCompleted") : t("hideCompletedTitle")}
                    >
                      {hideCompleted ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      onClick={() =>
                        setFocusedArea(focusedArea === "tension" ? null : "tension")
                      }
                      onMouseEnter={() => setHoveredSection("tension")}
                      onMouseLeave={() => setHoveredSection(null)}
                      title={focusedArea === "tension" ? t("restoreView") : t("expandView")}
                    >
                      {focusedArea === "tension" ? (
                        <Minimize2 className="w-3 h-3" />
                      ) : (
                        <Maximize2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-3 space-y-4" data-nav-scope="tension-action">
                    {(() => {
                      const areaOrder =
                        selectedAreaId === "all"
                          ? [...chart.areas.map((area) => area.id), null]
                          : selectedAreaId === "uncategorized"
                            ? [null]
                            : [selectedAreaId];

                      const allCompletedTensions: Tension[] = [];
                      areaOrder.forEach((areaId) => {
                        const group = areaId
                          ? structuredData.categorized.find((g) => g.area.id === areaId)
                          : structuredData.uncategorized;
                        const tensionsFromGroup = group ? group.tensions : [];
                        allCompletedTensions.push(
                          ...tensionsFromGroup.filter((t) => isTensionCompleted(t))
                        );
                      });

                      return (
                        <DndContext
                          id="dnd-context-action"
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleTensionDragEnd}
                        >
                          <TensionDragOverlay
                            tensions={tensions}
                            areas={chart.areas}
                            chartId={chartId}
                            handleUpdateTension={handleUpdateTension}
                            handleDeleteTension={handleDeleteTension}
                            handleUpdateActionPlan={handleUpdateActionPlan}
                            handleDeleteActionPlan={handleDeleteActionPlan}
                            handleTelescopeClick={handleTelescopeClick}
                            telescopingActionId={telescopingActionId}
                            currentUser={currentUser}
                            onOpenDetailPanel={handleOpenDetailPanelForModal}
                            onAddAction={handleAddActionPlan}
                            isSubmittingAction={isSubmittingAction}
                            handleOptimisticMove={handleOptimisticMove}
                            workspaceMembers={workspaceMembers}
                          />
                          <div className="space-y-4">
                            {areaOrder.map((areaId) => {
                              const area = areaId ? chart.areas.find((a) => a.id === areaId) : null;
                              const areaName = area ? area.name : tTags("untagged");
                              const areaColor = area ? area.color : "#9CA3AF";
                              const group = areaId
                                ? structuredData.categorized.find((g) => g.area.id === areaId)
                                : structuredData.uncategorized;

                              const tensionsInSection = group ? group.tensions : [];
                              const activeTensions = tensionsInSection.filter(
                                (t) => !isTensionCompleted(t)
                              );
                              const looseActionsInSection = group ? group.orphanedActions : [];

                              return (
                                <ActionSection
                                  key={areaId || "uncategorized"}
                                  areaId={areaId}
                                  areaName={areaName}
                                  areaColor={areaColor}
                                  tensionsInSection={activeTensions}
                                  looseActions={looseActionsInSection}
                                  allTensions={tensions}
                                  handleOptimisticMove={handleOptimisticMove}
                                  handleUpdateActionPlan={handleUpdateActionPlan}
                                  handleDeleteActionPlan={handleDeleteActionPlan}
                                  handleTelescopeClick={handleTelescopeClick}
                                  telescopingActionId={telescopingActionId}
                                  currentUser={currentUser}
                                  areas={chart.areas}
                                  chartId={chartId}
                                  onOpenDetailPanel={handleOpenDetailPanelForModal}
                                  getSortedAndNumberedActions={getSortedAndNumberedActions}
                                  isSubmittingAction={isSubmittingAction}
                                  onAddAction={handleAddActionPlan}
                                  onAddTension={handleAddTension}
                                  visions={visions}
                                  realities={realities}
                                  toggleVisionRealityLink={toggleVisionRealityLink}
                                  setHighlightedItemId={setHighlightedItemId}
                                  handleUpdateTension={handleUpdateTension}
                                  handleDeleteTension={handleDeleteTension}
                                  onOpenFocus={(tension) => {
                                    openFocusMode(
                                      "tension",
                                      tension.id,
                                      tension.title || "Tension",
                                      tension.title || ""
                                    );
                                  }}
                                  sortByStatus={sortByStatus}
                                  hideCompleted={hideCompleted}
                                  expandedCompletedTensions={expandedCompletedTensions}
                                  toggleCompletedTensionExpand={toggleCompletedTensionExpand}
                                  workspaceMembers={workspaceMembers}
                                />
                              );
                            })}
                            {allCompletedTensions.length > 0 && (
                              <div className="border-t border-gray-100 mt-2">
                                <button
                                  type="button"
                                  className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-sm text-gray-400 hover:text-gray-600 transition-colors"
                                  onClick={() =>
                                    setShowCompletedTensions(!showCompletedTensions)
                                  }
                                >
                                  {showCompletedTensions ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                  {t("completedTensions", { count: allCompletedTensions.length })}
                                </button>
                                {showCompletedTensions && (
                                  <div className="opacity-60">
                                    {allCompletedTensions.map((tension) => (
                                      <TensionGroup
                                        key={tension._stableKey ?? tension.id}
                                        tension={tension}
                                        tensionIndex={0}
                                        areaId={tension.area_id ?? null}
                                        allTensions={tensions}
                                        handleOptimisticMove={handleOptimisticMove}
                                        handleUpdateTension={handleUpdateTension}
                                        handleDeleteTension={handleDeleteTension}
                                        onMoveTensionArea={handleMoveTensionArea}
                                        handleUpdateActionPlan={
                                          handleUpdateActionPlan
                                        }
                                        handleDeleteActionPlan={
                                          handleDeleteActionPlan
                                        }
                                        handleTelescopeClick={handleTelescopeClick}
                                        telescopingActionId={telescopingActionId}
                                        currentUser={currentUser}
                                        areas={chart.areas}
                                        chartId={chartId}
                                        onOpenDetailPanel={handleOpenDetailPanelForModal}
                                        onAddAction={handleAddActionPlan}
                                        isSubmittingAction={isSubmittingAction}
                                        onOpenFocus={(t) =>
                                          openFocusMode(
                                            "tension",
                                            t.id,
                                            t.title || "Tension",
                                            t.title || ""
                                          )
                                        }
                                        sortByStatus={sortByStatus}
                                        hideCompleted={hideCompleted}
                                        expandedCompletedTensions={expandedCompletedTensions}
                                        toggleCompletedTensionExpand={toggleCompletedTensionExpand}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </DndContext>
                      );
                    })()}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {focusMode && (
        <FocusModeModal
          isOpen={focusMode.isOpen}
          onClose={() => setFocusMode(null)}
          title={focusMode.title}
          sectionType={focusMode.sectionType}
          initialContent={focusMode.content}
          onSave={handleFocusModeSave}
        />
      )}

      {/* アクション編集モーダル（アクションクリック時） */}
      {detailPanel?.itemType === "action" && detailPanel.itemId && (() => {
        const actionPlan =
          looseActions.find((a) => a.id === detailPanel.itemId) ??
          tensions.flatMap((t) => t.actionPlans).find((a) => a.id === detailPanel.itemId);
        const actionForModal = actionPlan
          ? {
              id: actionPlan.id,
              title: actionPlan.title || "",
              due_date: actionPlan.dueDate || null,
              assignee: actionPlan.assignee || null,
              status: (actionPlan.status || (actionPlan.isCompleted ? "done" : "todo")) as "todo" | "in_progress" | "done" | "pending" | "canceled",
              is_completed: actionPlan.isCompleted ?? actionPlan.status === "done",
              tension_id: actionPlan.tension_id ?? null,
              child_chart_id: actionPlan.childChartId ?? null,
              vision_tags: undefined,
              description: actionPlan.description ?? null,
            }
          : null;
        return (
          <ActionEditModal
            action={actionForModal}
            isOpen={detailPanel.isOpen}
            onClose={handleCloseDetailPanel}
            onSave={() => router.refresh()}
            onDataRefresh={() => router.refresh()}
            projectId={chartId}
            currentUserId={currentUserId || currentUser?.id}
            currentUser={currentUser}
            workspaceMembers={workspaceMembers}
          />
        );
      })()}

      {/* UnifiedDetailModal（Phase 2: 左ペイン完成） */}
      {unifiedModal && (() => {
        const item =
          unifiedModal.itemType === "vision"
            ? visions.find((v) => v.id === unifiedModal.itemId)
            : unifiedModal.itemType === "reality"
              ? realities.find((r) => r.id === unifiedModal.itemId)
              : looseActions.find((a) => a.id === unifiedModal.itemId) ??
                tensions.flatMap((t) => t.actionPlans).find((a) => a.id === unifiedModal.itemId);
        const actionItem = unifiedModal.itemType === "action" ? item as ActionPlan | undefined : undefined;
        const childChartTitle = null;
        const handleItemUpdate = (field: string, value: string | boolean | null) => {
          if (unifiedModal.itemType === "vision") {
            void handleUpdateVision(unifiedModal.itemId, field as "content" | "assignee" | "dueDate" | "areaId" | "description", value);
          } else if (unifiedModal.itemType === "reality") {
            void handleUpdateReality(unifiedModal.itemId, field as "content" | "areaId" | "dueDate" | "description", value);
          } else if (unifiedModal.itemType === "action" && actionItem) {
            if (field === "tensionId") {
              const newTensionId = value as string | null;
              if (newTensionId) {
                void moveActionToTension(unifiedModal.itemId, newTensionId, chartId).then((r) => {
                  if (r?.success) router.refresh();
                });
              } else {
                void moveActionToLoose(unifiedModal.itemId, chartId).then((r) => {
                  if (r?.success) router.refresh();
                });
              }
              return;
            }
            const tensionId = actionItem.tension_id ?? null;
            void handleUpdateActionPlan(tensionId, unifiedModal.itemId, field as Parameters<typeof handleUpdateActionPlan>[2], value);
          }
        };
        const activeActionItems = [
          ...looseActions.map((a) => ({ id: a.id, type: "action" as const })),
          ...tensions
            .filter((t) => !isTensionCompleted(t))
            .flatMap((t) =>
              t.actionPlans.map((a) => ({ id: a.id, type: "action" as const }))
            ),
        ];
        const navigationItems =
          unifiedModal.itemType === "vision"
            ? visions.map((v) => ({ id: v.id, type: "vision" as const }))
            : unifiedModal.itemType === "reality"
              ? realities.map((r) => ({ id: r.id, type: "reality" as const }))
              : activeActionItems;
        return (
          <UnifiedDetailModal
            isOpen={unifiedModal.isOpen}
            onClose={closeUnifiedModal}
            itemType={unifiedModal.itemType}
            itemId={unifiedModal.itemId}
            chartId={chartId}
            workspaceId={workspaceId}
            item={item ?? null}
            areas={chart.areas ?? []}
            members={workspaceMembers}
            currentUser={currentUser}
            currentUserId={currentUserId || currentUser?.id}
            tensions={tensions}
            childChartTitle={childChartTitle}
            onUpdate={handleItemUpdate}
            items={navigationItems}
            onNavigate={(nextType, nextId) =>
              setUnifiedModal({ isOpen: true, itemType: nextType, itemId: nextId })
            }
          />
        );
      })()}

      {/* 詳細サイドパネル（Vision/Reality用）※Phase 4 で削除 */}
      {detailPanel && detailPanel.itemType !== "action" && (
        <ItemDetailPanel
          isOpen={detailPanel.isOpen}
          onClose={handleCloseDetailPanel}
          itemType={detailPanel.itemType}
          itemId={detailPanel.itemId}
          itemContent={detailPanel.itemContent}
          history={itemHistory}
          currentUserId={currentUserId || currentUser?.id}
          currentUser={currentUser}
          chartId={chartId}
          workspaceId={workspaceId}
          onAddHistory={handleAddHistory}
          onCommentCountChange={handleCommentCountChange}
        />
      )}
      <ProposalsPanel
        chartId={chart.id}
        isOpen={isProposalsPanelOpen}
        onClose={() => setIsProposalsPanelOpen(false)}
        canApprove={canApproveProposal(
          (workspaceMembers.find((m) => m.id === (currentUserId || currentUser?.id))?.role as "owner" | "consultant" | "editor" | "viewer") || "viewer"
        )}
        onApproved={() => {
          router.refresh();
          // Re-fetch pending count
          fetch(`/api/proposals/list?chartId=${chart.id}&status=pending`)
            .then((r) => r.json())
            .then((d) => setPendingProposalsCount(d.proposals?.length ?? 0))
            .catch(() => {});
        }}
      />
      <AICoachButton
          chartData={collectChartDataForAI(
            chart,
            visions,
            realities,
            tensions,
            chart.areas ?? [],
            workspaceMembers
          )}
          chartId={chart.id}
          onAddItems={async (items: StructuredItems) => {
            // 1. Vision追加
            for (const v of items.visions) {
              await addVision(chart.id, v.title);
            }
            // 2. Reality追加
            for (const r of items.realities) {
              await addReality(chart.id, r.title);
            }
            // 3. Tension追加（IDを保持してAction紐付けに使う）
            const newTensionIds: string[] = [];
            for (const t of items.tensions) {
              const result = await addTension(chart.id, t.title);
              if (result?.id) {
                newTensionIds.push(result.id);
              }
            }
            // 4. Action追加（tensionIndexで新Tensionに紐付け）
            for (const a of items.actions) {
              const idx = a.tensionIndex;
              if (typeof idx === "number" && idx >= 0 && newTensionIds[idx]) {
                await addActionPlan(newTensionIds[idx], a.title, null, chart.id);
              }
              // tensionIndex === -1 は既存Tension向け（今回はスキップ）
            }
            // ページを更新してデータを反映
            router.refresh();
          }}
        />
    </div>
  );
}

function ComparisonView({
  visions,
  realities,
  tensions,
  looseActions,
  areas,
  selectedAreaFilter,
  structuredData,
  chartId,
  sensors,
  onTensionDragEnd,
  onVisionRealityDragEnd,
  handleUpdateVision,
  handleDeleteVision,
  handleAddVision,
  handleUpdateReality,
  handleDeleteReality,
  handleAddReality,
  isSubmittingVision,
  isSubmittingReality,
  handleUpdateActionPlan,
  handleDeleteActionPlan,
  handleTelescopeClick,
  telescopingActionId,
  currentUser,
  onOpenDetailPanel,
  onOpenAreaSettings,
  highlightedItemId,
  onOpenFocusVision,
  onOpenFocusReality,
  getSortedAndNumberedActions,
  isSubmittingAction,
  onAddAction,
  onAddTension,
  toggleVisionRealityLink,
  setHighlightedItemId,
  handleUpdateTension,
  handleDeleteTension,
  onOpenFocusTension,
  sortByStatus,
  setSortByStatus,
  hideCompleted,
  setHideCompleted,
  showCompletedTensions,
  setShowCompletedTensions,
  isTensionCompleted,
  expandedCompletedTensions = new Set(),
  toggleCompletedTensionExpand,
  handleOptimisticMove,
  onMoveTensionArea,
  workspaceMembers = [],
}: {
  visions: VisionItem[];
  realities: RealityItem[];
  tensions: Tension[];
  looseActions: ActionPlan[];
  areas: Area[];
  selectedAreaFilter: string;
  structuredData: StructuredData;
  chartId: string;
  sensors: ReturnType<typeof useSensors>;
  onTensionDragEnd: (event: DragEndEvent) => void;
  onVisionRealityDragEnd: (event: DragEndEvent, type: "visions" | "realities") => void;
  handleUpdateVision: (id: string, field: "content" | "assignee" | "dueDate" | "targetDate" | "isLocked" | "areaId", value: string | boolean | null) => Promise<void>;
  handleDeleteVision: (id: string) => Promise<void>;
  handleAddVision: (content: string, areaId?: string | null) => void;
  handleUpdateReality: (id: string, field: "content" | "isLocked" | "areaId" | "dueDate", value: string | boolean | null) => Promise<void>;
  handleDeleteReality: (id: string) => Promise<void>;
  handleAddReality: (content: string, areaId?: string | null) => void;
  isSubmittingVision: boolean;
  isSubmittingReality: boolean;
  handleUpdateActionPlan: (
    tensionId: string | null,
    actionId: string,
    field: "title" | "dueDate" | "assignee" | "status" | "hasSubChart" | "subChartId" | "childChartId" | "isCompleted" | "description" | "areaId",
    value: string | boolean | null
  ) => Promise<void>;
  handleDeleteActionPlan: (tensionId: string | null, actionId: string) => Promise<void>;
  handleTelescopeClick: (actionPlan: ActionPlan, tensionId: string | null) => Promise<void>;
  telescopingActionId: string | null;
  currentUser: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  onOpenDetailPanel: (itemType: "vision" | "reality" | "action", itemId: string, itemContent: string) => void;
  onOpenAreaSettings?: () => void;
  highlightedItemId: string | null;
  onOpenFocusVision: (item: VisionItem, index: number) => void;
  onOpenFocusReality: (item: RealityItem, index: number) => void;
  getSortedAndNumberedActions: (actions: ActionPlan[]) => Array<{ action: ActionPlan; number: number }>;
  isSubmittingAction: Record<string, boolean>;
  onAddAction: (tensionId: string | null, title: string, areaId?: string | null) => void;
  onAddTension: (title: string, areaId?: string | null) => void;
  toggleVisionRealityLink: (tensionId: string, type: "vision" | "reality", id: string) => void;
  setHighlightedItemId: (id: string | null) => void;
  handleUpdateTension: (tensionId: string, field: "title" | "description" | "status", value: string | TensionStatus) => void;
  handleDeleteTension: (tensionId: string) => void;
  onOpenFocusTension: (tension: Tension) => void;
  sortByStatus: boolean;
  setSortByStatus: (v: boolean) => void;
  hideCompleted: boolean;
  setHideCompleted: (v: boolean) => void;
  showCompletedTensions: boolean;
  setShowCompletedTensions: (v: boolean) => void;
  isTensionCompleted: (tension: Tension) => boolean;
  expandedCompletedTensions?: Set<string>;
  toggleCompletedTensionExpand?: (tensionId: string) => void;
  handleOptimisticMove?: (sourceTensionId: string, targetTensionId: string, action: ActionPlan) => void;
  onMoveTensionArea?: (tensionId: string, targetAreaId: string | null) => Promise<void>;
  workspaceMembers?: WorkspaceMember[];
}) {
  const t = useTranslations("editor");
  const tTags = useTranslations("tags");
  const [visionInputByArea, setVisionInputByArea] = useState<Record<string, string>>({});
  const [realityInputByArea, setRealityInputByArea] = useState<Record<string, string>>({});

  const allAreaIds = useMemo(() => {
    const v = Array.isArray(visions) ? visions : [];
    const r = Array.isArray(realities) ? realities : [];
    const areaIds = new Set<string>();
    v.forEach((item) => areaIds.add(item.area_id || "uncategorized"));
    r.forEach((item) => areaIds.add(item.area_id || "uncategorized"));
    if (areaIds.size === 0) return ["uncategorized"];

    // areas の sort_order に基づいてソート（標準モードと同じ順序）
    const areaOrderMap = new Map(areas.map((a, i) => [a.id, a.sort_order ?? i]));
    return Array.from(areaIds).sort((a, b) => {
      if (a === "uncategorized") return 1;  // 未分類は常に最後
      if (b === "uncategorized") return -1;
      return (areaOrderMap.get(a) ?? 999) - (areaOrderMap.get(b) ?? 999);
    });
  }, [visions, realities, areas]);

  const getAreaName = (areaId: string) => {
    if (areaId === "uncategorized") return tTags("untagged");
    const area = areas.find((a) => a.id === areaId);
    return area?.name || tTags("untagged");
  };

  const getAreaColor = (areaId: string) => {
    if (areaId === "uncategorized") return "#9CA3AF";
    const area = areas.find((a) => a.id === areaId);
    return area?.color || "#9CA3AF";
  };

  const areaOrder =
    selectedAreaFilter === "all"
      ? [...areas.map((a) => a.id), null]
      : selectedAreaFilter === "uncategorized"
        ? [null]
        : [selectedAreaFilter];

  const handleVrDragEnd = (event: DragEndEvent) => {
    const v = Array.isArray(visions) ? visions : [];
    const isVision = v.some((item) => item.id === event.active.id);
    onVisionRealityDragEnd(event, isVision ? "visions" : "realities");
  };

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* V/R対比エリア — コンテンツに合わせて伸びる */}
      <div className="flex-none p-6 pb-3">
        <DndContext
          id="dnd-context-comparison-vr"
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragEnd={handleVrDragEnd}
        >
          <div className="space-y-4">
            {allAreaIds.map((areaId, areaIndex) => {
              const v = Array.isArray(visions) ? visions : [];
              const r = Array.isArray(realities) ? realities : [];
              const areaVisions = v.filter((item) => (item.area_id || "uncategorized") === areaId);
              const areaRealities = r.filter((item) => (item.area_id || "uncategorized") === areaId);

              if (selectedAreaFilter !== "all" && selectedAreaFilter !== areaId) return null;

              const visionInput = visionInputByArea[areaId] ?? "";
              const realityInput = realityInputByArea[areaId] ?? "";
              const setVisionInput = (v: string) =>
                setVisionInputByArea((prev) => ({ ...prev, [areaId]: v }));
              const setRealityInput = (v: string) =>
                setRealityInputByArea((prev) => ({ ...prev, [areaId]: v }));

              return (
                <div
                  key={areaId}
                  className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ${areaIndex > 0 ? "mt-4" : ""}`}
                >
                  {/* タグ名ヘッダー — カードの上部 */}
                  <div className="px-4 py-2 mb-2 bg-gray-50 border-b flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: getAreaColor(areaId) }}
                    />
                    <span className="text-sm font-bold text-zenshin-navy">
                      {getAreaName(areaId)}
                    </span>
                    <span className="ml-2 text-xs text-zenshin-navy/40">
                      {t("itemCount", { count: areaVisions.length + areaRealities.length })}
                    </span>
                  </div>

                  {/* V | R 横並び */}
                  <div className="grid grid-cols-2 divide-x divide-gray-200">
                    {/* Vision側 */}
                    <div className="p-0">
                      <div className="px-3 py-1.5 bg-zenshin-teal/8 border-b border-gray-100 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-zenshin-teal" />
                        <span className="text-xs font-bold text-zenshin-teal uppercase tracking-wider">{t("vision")}</span>
                      </div>
                      <div className="space-y-1 px-2 py-1.5 min-h-[40px]">
                        <SortableContext items={areaVisions} strategy={verticalListSortingStrategy}>
                          {areaVisions.length === 0 ? (
                            <div className="text-zenshin-navy/40 text-sm py-2 px-1 select-none opacity-60">
                              {t("noItems")}
                            </div>
                          ) : (
                            areaVisions.map((vision, index) => (
                              <SortableVisionItem
                                key={vision.id}
                                vision={vision}
                                index={index}
                                chartId={chartId}
                                onUpdate={handleUpdateVision}
                                onDelete={handleDeleteVision}
                                areas={areas}
                                onOpenDetail={(item) =>
                                  onOpenDetailPanel("vision", item.id, item.content || "")
                                }
                                onOpenFocus={(item, itemIndex) =>
                                  onOpenFocusVision(item, itemIndex)
                                }
                                onOpenAreaSettings={onOpenAreaSettings}
                                currentUser={currentUser as any}
                                workspaceMembers={workspaceMembers}
                              />
                            ))
                          )}
                        </SortableContext>
                      </div>
                      <div className="mt-2 py-1.5 px-2 border-t border-gray-100 flex gap-2">
                        <Input
                          value={visionInput}
                          onChange={(e) => setVisionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (visionInput.trim()) {
                                handleAddVision(visionInput.trim(), areaId === "uncategorized" ? null : areaId);
                                setVisionInput("");
                              }
                              return;
                            }
                          }}
                          placeholder={t("addNewVisionPlaceholder")}
                          className="text-sm h-7 flex-1"
                          disabled={isSubmittingVision}
                        />
                        <Button
                          onClick={() => {
                            if (visionInput.trim()) {
                              handleAddVision(visionInput.trim(), areaId === "uncategorized" ? null : areaId);
                              setVisionInput("");
                            }
                          }}
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={!visionInput.trim() || isSubmittingVision}
                        >
                          {isSubmittingVision ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Reality側 */}
                    <div className="p-0">
                      <div className="px-3 py-1.5 bg-zenshin-orange/8 border-b border-gray-100 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-zenshin-orange" />
                        <span className="text-xs font-bold text-zenshin-orange uppercase tracking-wider">{t("reality")}</span>
                      </div>
                      <div className="space-y-1 px-2 py-1.5 min-h-[40px]">
                        <SortableContext items={areaRealities} strategy={verticalListSortingStrategy}>
                          {areaRealities.length === 0 ? (
                            <div className="text-zenshin-navy/40 text-sm py-2 px-1 select-none opacity-60">
                              {t("noItems")}
                            </div>
                          ) : (
                            areaRealities.map((reality, index) => (
                              <SortableRealityItem
                                key={reality.id}
                                reality={reality}
                                index={index}
                                highlightedItemId={highlightedItemId}
                                handleUpdateReality={handleUpdateReality}
                                handleDeleteReality={handleDeleteReality}
                                areas={areas}
                                onOpenDetail={(item) =>
                                  onOpenDetailPanel("reality", item.id, item.content || "")
                                }
                                onOpenFocus={(item, itemIndex) =>
                                  onOpenFocusReality(item, itemIndex)
                                }
                                onOpenAreaSettings={onOpenAreaSettings}
                                currentUser={currentUser as any}
                                workspaceMembers={workspaceMembers}
                              />
                            ))
                          )}
                        </SortableContext>
                      </div>
                      <div className="mt-2 py-1.5 px-2 border-t border-gray-100 flex gap-2">
                        <Input
                          value={realityInput}
                          onChange={(e) => setRealityInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (realityInput.trim()) {
                                handleAddReality(realityInput.trim(), areaId === "uncategorized" ? null : areaId);
                                setRealityInput("");
                              }
                              return;
                            }
                          }}
                          placeholder={t("addNewRealityPlaceholder")}
                          className="text-sm h-7 flex-1"
                          disabled={isSubmittingReality}
                        />
                        <Button
                          onClick={() => {
                            if (realityInput.trim()) {
                              handleAddReality(realityInput.trim(), areaId === "uncategorized" ? null : areaId);
                              setRealityInput("");
                            }
                          }}
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={!realityInput.trim() || isSubmittingReality}
                        >
                          {isSubmittingReality ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DndContext>
      </div>

      {/* T&Aエリア — 残りの高さを使う、最低でも画面の80%確保 */}
      <div className="flex-1 min-h-[80vh] px-6 pt-3 pb-6">
        <div className="flex flex-col bg-white border-2 border-zenshin-navy/30 rounded-lg shadow-sm overflow-hidden h-full">
          <div className="px-3 pt-2 pb-3 border-b bg-zenshin-navy/8 flex items-center justify-between rounded-t-lg shrink-0">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-zenshin-navy" />
              <h2 className="text-base font-bold text-zenshin-navy leading-tight">{t("tensionAndAction")}</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className={`h-6 w-6 rounded transition-colors ${
                  sortByStatus
                    ? "bg-zenshin-navy/15 text-zenshin-navy"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setSortByStatus(!sortByStatus)}
                title={t("sortByStatusTitle")}
              >
                <ArrowUpDown className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={`h-6 w-6 rounded transition-colors ${
                  hideCompleted
                    ? "bg-zenshin-orange/15 text-zenshin-orange"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setHideCompleted(!hideCompleted)}
                title={hideCompleted ? t("showCompleted") : t("hideCompletedTitle")}
              >
                {hideCompleted ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0 overflow-auto">
            <div className="p-3 space-y-4" data-nav-scope="tension-action">
              <DndContext
                id="dnd-context-action-comparison"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onTensionDragEnd}
              >
                <TensionDragOverlay
                  tensions={tensions}
                  areas={areas}
                  chartId={chartId}
                  handleUpdateTension={handleUpdateTension}
                  handleDeleteTension={handleDeleteTension}
                  handleUpdateActionPlan={handleUpdateActionPlan}
                  handleDeleteActionPlan={handleDeleteActionPlan}
                  handleTelescopeClick={handleTelescopeClick}
                  telescopingActionId={telescopingActionId}
                  currentUser={currentUser}
                  onOpenDetailPanel={onOpenDetailPanel}
                  onAddAction={onAddAction}
                  isSubmittingAction={isSubmittingAction}
                  handleOptimisticMove={handleOptimisticMove}
                  workspaceMembers={workspaceMembers}
                />
                <div className="space-y-4">
                  {(() => {
                    const allCompletedTensions: Tension[] = [];
                    areaOrder.forEach((areaId) => {
                      const group = areaId
                        ? structuredData.categorized.find((g) => g.area.id === areaId)
                        : structuredData.uncategorized;
                      const tensionsFromGroup = group ? group.tensions : [];
                      allCompletedTensions.push(
                        ...tensionsFromGroup.filter((t) => isTensionCompleted(t))
                      );
                    });
                    return (
                      <>
                        {areaOrder.map((areaId) => {
                          const area = areaId ? areas.find((a) => a.id === areaId) : null;
                          const areaName = area ? area.name : tTags("untagged");
                          const areaColor = area ? area.color : "#9CA3AF";
                          const group = areaId
                            ? structuredData.categorized.find((g) => g.area.id === areaId)
                            : structuredData.uncategorized;

                          const tensionsInSection = group ? group.tensions : [];
                          const activeTensions = tensionsInSection.filter(
                            (t) => !isTensionCompleted(t)
                          );
                          const looseActionsInSection = group ? group.orphanedActions : [];

                          return (
                            <ActionSection
                              key={areaId || "uncategorized"}
                              areaId={areaId}
                              areaName={areaName}
                              areaColor={areaColor}
                              tensionsInSection={activeTensions}
                              looseActions={looseActionsInSection}
                              allTensions={tensions}
                              handleOptimisticMove={handleOptimisticMove}
                              handleUpdateActionPlan={handleUpdateActionPlan}
                              handleDeleteActionPlan={handleDeleteActionPlan}
                              handleTelescopeClick={handleTelescopeClick}
                              telescopingActionId={telescopingActionId}
                              currentUser={currentUser}
                              areas={areas}
                              chartId={chartId}
                              onOpenDetailPanel={onOpenDetailPanel}
                              getSortedAndNumberedActions={getSortedAndNumberedActions}
                              isSubmittingAction={isSubmittingAction}
                              onAddAction={onAddAction}
                              onAddTension={onAddTension}
                              visions={visions}
                              realities={realities}
                              toggleVisionRealityLink={toggleVisionRealityLink}
                              setHighlightedItemId={setHighlightedItemId}
                              handleUpdateTension={handleUpdateTension}
                              handleDeleteTension={handleDeleteTension}
                              onMoveTensionArea={onMoveTensionArea}
                              onOpenFocus={onOpenFocusTension}
                              sortByStatus={sortByStatus}
                              hideCompleted={hideCompleted}
                              expandedCompletedTensions={expandedCompletedTensions}
                              toggleCompletedTensionExpand={toggleCompletedTensionExpand}
                              workspaceMembers={workspaceMembers}
                            />
                          );
                        })}
                        {allCompletedTensions.length > 0 && (
                          <div className="border-t border-gray-100 mt-2">
                            <button
                              type="button"
                              className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-sm text-gray-400 hover:text-gray-600 transition-colors"
                              onClick={() =>
                                setShowCompletedTensions(!showCompletedTensions)
                              }
                            >
                              {showCompletedTensions ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                              {t("completedTensions", { count: allCompletedTensions.length })}
                            </button>
                            {showCompletedTensions && (
                              <div className="opacity-60">
                                {allCompletedTensions.map((tension) => (
                                  <TensionGroup
                                    key={tension._stableKey ?? tension.id}
                                    tension={tension}
                                    tensionIndex={0}
                                    areaId={tension.area_id ?? null}
                                    allTensions={tensions}
                                    handleOptimisticMove={handleOptimisticMove}
                                    handleUpdateTension={handleUpdateTension}
                                    handleDeleteTension={handleDeleteTension}
                                    onMoveTensionArea={onMoveTensionArea}
                                    handleUpdateActionPlan={handleUpdateActionPlan}
                                    handleDeleteActionPlan={handleDeleteActionPlan}
                                    handleTelescopeClick={handleTelescopeClick}
                                    telescopingActionId={telescopingActionId}
                                    currentUser={currentUser}
                                    areas={areas}
                                    chartId={chartId}
                                    onOpenDetailPanel={onOpenDetailPanel}
                                    onAddAction={onAddAction}
                                    isSubmittingAction={isSubmittingAction}
                                    onOpenFocus={onOpenFocusTension}
                                    sortByStatus={sortByStatus}
                                    hideCompleted={hideCompleted}
                                    workspaceMembers={workspaceMembers}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </DndContext>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
