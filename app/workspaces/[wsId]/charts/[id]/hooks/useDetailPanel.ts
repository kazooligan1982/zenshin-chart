import { useState } from "react";
import type { VisionItem, RealityItem, Tension, ActionPlan, HistoryItem } from "@/types/chart";
import { useRouter } from "next/navigation";
import { fetchItemHistory, addItemHistoryEntry } from "../actions";
import { logger } from "@/lib/logger";

export function useDetailPanel({
  chartId,
  setVisions,
  setRealities,
  setTensions,
  setLooseActions,
  router,
}: {
  chartId: string;
  setVisions: React.Dispatch<React.SetStateAction<VisionItem[]>>;
  setRealities: React.Dispatch<React.SetStateAction<RealityItem[]>>;
  setTensions: React.Dispatch<React.SetStateAction<Tension[]>>;
  setLooseActions: React.Dispatch<React.SetStateAction<ActionPlan[]>>;
  router: ReturnType<typeof useRouter>;
}) {
  const [detailPanel, setDetailPanel] = useState<{
    isOpen: boolean;
    itemType: "vision" | "reality" | "action";
    itemId: string;
    itemContent: string;
  } | null>(null);
  const [itemHistory, setItemHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // サイドパネルを開く
  const handleOpenDetailPanel = async (
    itemType: "vision" | "reality" | "action",
    itemId: string,
    itemContent: string
  ) => {
    setDetailPanel({
      isOpen: true,
      itemType,
      itemId,
      itemContent,
    });
    if (itemType !== "action") {
      setIsLoadingHistory(true);
      try {
        const history = await fetchItemHistory(itemType, itemId);
        setItemHistory(history);
      } catch (error) {
        logger.error("履歴の取得に失敗しました:", error);
        setItemHistory([]);
      } finally {
        setIsLoadingHistory(false);
      }
    } else {
      setItemHistory([]);
      setIsLoadingHistory(false);
    }
  };

  // サイドパネルを閉じる
  const handleCloseDetailPanel = () => {
    setDetailPanel(null);
    setItemHistory([]);
  };

  // 履歴を追加
  const handleAddHistory = async (
    itemType: "vision" | "reality" | "action",
    itemId: string,
    content: string,
    type: "update" | "comment",
    updateMainContent: boolean
  ) => {
    await addItemHistoryEntry(itemType, itemId, content, type, updateMainContent, chartId);
    // 履歴を再取得
    const history = await fetchItemHistory(itemType, itemId);
    setItemHistory(history);
    // メインコンテンツを更新した場合はページをリフレッシュ
    if (updateMainContent) {
      router.refresh();
    }
  };

  const handleCommentCountChange = (
    itemType: "vision" | "reality" | "action",
    itemId: string,
    delta: number
  ) => {
    if (itemType === "vision") {
      setVisions((prev) =>
        prev.map((vision) =>
          vision.id === itemId
            ? {
                ...vision,
                comment_count: Math.max(0, (vision.comment_count ?? 0) + delta),
              }
            : vision
        )
      );
      return;
    }
    if (itemType === "reality") {
      setRealities((prev) =>
        prev.map((reality) =>
          reality.id === itemId
            ? {
                ...reality,
                comment_count: Math.max(0, (reality.comment_count ?? 0) + delta),
              }
            : reality
        )
      );
      return;
    }
    setTensions((prev) =>
      prev.map((tension) => ({
        ...tension,
        actionPlans: tension.actionPlans.map((actionPlan) =>
          actionPlan.id === itemId
            ? {
                ...actionPlan,
                comment_count: Math.max(
                  0,
                  (actionPlan.comment_count ?? 0) + delta
                ),
              }
            : actionPlan
        ),
      }))
    );
    setLooseActions((prev) =>
      prev.map((actionPlan) =>
        actionPlan.id === itemId
          ? {
              ...actionPlan,
              comment_count: Math.max(
                0,
                (actionPlan.comment_count ?? 0) + delta
              ),
            }
          : actionPlan
      )
    );
  };

  return {
    detailPanel,
    itemHistory,
    isLoadingHistory,
    handleOpenDetailPanel,
    handleCloseDetailPanel,
    handleAddHistory,
    handleCommentCountChange,
  };
}
