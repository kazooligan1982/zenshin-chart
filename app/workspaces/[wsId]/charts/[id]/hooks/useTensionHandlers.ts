import type { Tension, TensionStatus, ActionPlan, VisionItem, RealityItem, Area } from "@/types/chart";
import { logger } from "@/lib/logger";

type PendingDeletionMap = Record<string, { type: "vision" | "reality" | "action" | "tension"; item: VisionItem | RealityItem | ActionPlan | Tension; tensionId?: string | null; timeoutId: NodeJS.Timeout }>;
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  addTension,
  updateTensionItem,
  removeTension,
  toggleVisionRealityLinkAction,
  updateTensionArea,
} from "../actions";

export function useTensionHandlers({
  chartId,
  tensions,
  setTensions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  visions: _visions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  realities: _realities,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  looseActions: _looseActions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setLooseActions: _setLooseActions,
  pendingDeletions,
  setPendingDeletions,
  areas,
  router,
}: {
  chartId: string;
  tensions: Tension[];
  setTensions: React.Dispatch<React.SetStateAction<Tension[]>>;
  visions: VisionItem[];
  realities: RealityItem[];
  looseActions: ActionPlan[];
  setLooseActions: React.Dispatch<React.SetStateAction<ActionPlan[]>>;
  pendingDeletions: PendingDeletionMap;
  setPendingDeletions: React.Dispatch<React.SetStateAction<PendingDeletionMap>>;
  areas: Area[];
  router: ReturnType<typeof useRouter>;
}) {
  const tt = useTranslations("toast");
  const tTags = useTranslations("tags");
  const handleAddTension = async (title: string, areaId?: string | null) => {
    if (!title.trim()) return;
    const titleToAdd = title.trim();

    // 楽観的にローカルStateを即時更新
    const tempId = `temp-${Date.now()}`;
    const optimisticTension: Tension = {
      id: tempId,
      title: titleToAdd,
      status: "active" as TensionStatus,
      area_id: areaId ?? null,
      visionIds: [],
      realityIds: [],
      actionPlans: [],
    };
    setTensions((prev) => [...prev, optimisticTension]);

    try {
      const newTension = await addTension(chartId, titleToAdd, areaId);
      if (newTension) {
        // 成功: tempIdを実際のデータに置換。_stableKeyでReact keyを維持し、Action入力欄のstateを保持
        setTensions((prev) =>
          prev.map((t) =>
            t.id === tempId ? { ...newTension, _stableKey: tempId } : t
          )
        );
        toast.success(tt("tensionCreated"), { duration: 3000 });
      } else {
        // 失敗: ロールバック
        setTensions((prev) => prev.filter((t) => t.id !== tempId));
        logger.error("[handleAddTension] 保存失敗 - ロールバック");
      }
    } catch (error) {
      logger.error("[handleAddTension] エラー:", error);
      setTensions((prev) => prev.filter((t) => t.id !== tempId));
    }
  };

  const handleUpdateTension = async (
    tensionId: string,
    field: "title" | "description" | "status",
    value: string | TensionStatus
  ) => {
    const previousState = tensions;
    // 楽観的にローカル状態を即時更新（title, description, status すべて）
    setTensions((prev) =>
      prev.map((t) =>
        t.id === tensionId ? { ...t, [field]: value } : t
      )
    );
    try {
      const success = await updateTensionItem(tensionId, chartId, field, value);
      if (success) {
        if (field === "status") {
          const prevStatus = (previousState.find((t) => t.id === tensionId)?.status ?? "active") as TensionStatus;
          if (value === "resolved") {
            toast.success(tt("tensionCompleted"), {
              duration: 15000,
              action: {
                label: tt("undo"),
                onClick: async () => {
                  setTensions(previousState);
                  await updateTensionItem(tensionId, chartId, "status", prevStatus);
                },
              },
            });
          } else if (value === "active") {
            toast.success(tt("tensionReopened"), {
              duration: 15000,
              action: {
                label: tt("undo"),
                onClick: async () => {
                  setTensions(previousState);
                  await updateTensionItem(tensionId, chartId, "status", prevStatus);
                },
              },
            });
          }
        }
        // router.refresh() 不要 — revalidatePathがサーバー側で自動処理
      } else {
        setTensions(previousState);
        logger.error("[handleUpdateTension] 更新失敗");
      }
    } catch (error) {
      logger.error("[handleUpdateTension] エラー:", error);
      setTensions(previousState);
    }
  };

  const handleMoveTensionArea = async (tensionId: string, targetAreaId: string | null) => {
    const tension = tensions.find((t) => t.id === tensionId);
    if (!tension) return;

    const previousState = tensions;
    setTensions((prev) =>
      prev.map((t) =>
        t.id === tensionId ? { ...t, area_id: targetAreaId } : t
      )
    );
    try {
      const result = await updateTensionArea(tensionId, targetAreaId, chartId, true);
      if (result.success) {
        const areaName =
          targetAreaId !== null ? areas.find((a) => a.id === targetAreaId)?.name : "未分類";
        const prevAreaId = tension.area_id;
        toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), {
          duration: 15000,
          action: {
            label: tt("undo"),
            onClick: async () => {
              setTensions(previousState);
              await updateTensionArea(tensionId, prevAreaId ?? null, chartId, true);
            },
          },
        });
        // router.refresh() 不要 — revalidatePathがサーバー側で自動処理
      } else {
        setTensions(previousState);
        toast.error(tt("moveFailed"), { duration: 5000 });
      }
    } catch (error) {
      logger.error("[handleMoveTensionArea] エラー:", error);
      setTensions(previousState);
      toast.error(tt("moveFailed"), { duration: 5000 });
    }
  };

  const handleDeleteTension = async (tensionId: string) => {
    const tension = tensions.find((t) => t.id === tensionId);
    if (!tension) return;

    // 既存の削除予約があればキャンセル
    const existingKey = `tension-${tensionId}`;
    if (pendingDeletions[existingKey]) {
      clearTimeout(pendingDeletions[existingKey].timeoutId);
    }

    // 楽観的UI更新（一時的に非表示）
    const originalTensions = [...tensions];
    setTensions(tensions.filter((t) => t.id !== tensionId));

    // 15秒後に実際に削除
    const timeoutId = setTimeout(async () => {
      const success = await removeTension(tensionId, chartId);
      if (success) {
        router.refresh();
      } else {
        // 削除失敗時は元に戻す
        setTensions(originalTensions);
        toast.error(tt("deleteFailed"), { duration: 5000 });
      }
      setPendingDeletions((prev: PendingDeletionMap) => {
        const next = { ...prev };
        delete next[existingKey];
        return next;
      });
    }, 15000);

    // 削除予約を保存
    setPendingDeletions((prev: PendingDeletionMap) => ({
      ...prev,
      [existingKey]: {
        type: "tension",
        item: tension,
        timeoutId,
      },
    }));

    toast.success(tt("tensionDeleted"), {
      duration: 15000,
      action: {
        label: tt("undo"),
        onClick: () => {
          clearTimeout(timeoutId);
          setTensions(originalTensions);
          setPendingDeletions((prev: PendingDeletionMap) => {
            const next = { ...prev };
            delete next[existingKey];
            return next;
          });
        },
      },
    });
  };

  const toggleVisionRealityLink = async (
    tensionId: string,
    type: "vision" | "reality",
    itemId: string
  ) => {
    const tension = tensions.find((t) => t.id === tensionId);
    if (!tension) return;

    const isCurrentlyLinked =
      type === "vision"
        ? tension.visionIds.includes(itemId)
        : tension.realityIds.includes(itemId);

    // Server updateのみ（Optimistic UIなし）
    const success = await toggleVisionRealityLinkAction(
      tensionId,
      type,
      itemId,
      chartId,
      isCurrentlyLinked
    );
    if (success) {
      // 成功時はページを再取得
      router.refresh();
    } else {
      logger.error("[toggleVisionRealityLink] 更新失敗");
    }
  };

  const handleOptimisticMove = (sourceTensionId: string, targetTensionId: string, action: ActionPlan) => {
    setTensions((prev) =>
      prev.map((tension) => {
        if (tension.id === sourceTensionId) {
          return { ...tension, actionPlans: tension.actionPlans.filter((a) => a.id !== action.id) };
        }
        if (tension.id === targetTensionId) {
          return { ...tension, actionPlans: [...tension.actionPlans, action] };
        }
        return tension;
      })
    );
  };

  return {
    handleAddTension,
    handleUpdateTension,
    handleDeleteTension,
    handleMoveTensionArea,
    toggleVisionRealityLink,
    handleOptimisticMove,
  };
}
