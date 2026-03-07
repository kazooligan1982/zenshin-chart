import type React from "react";
import type { Tension, ActionPlan } from "@/types/chart";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  addActionPlan,
  updateActionPlanItem,
  removeActionPlan,
  telescopeActionPlan,
  updateActionArea,
} from "../actions";

export let _pendingScrollRestore: number | null = null;

function showAllActionsCompletedToast(
  tensionId: string,
  handleUpdateTension: (tensionId: string, field: "title" | "description" | "status", value: string) => Promise<void>
) {
  toast("🎉 すべてのアクションが完了しました！", {
    description: "このTensionは解消されましたか？",
    duration: 30000,
    action: {
      label: "完了にする",
      onClick: async () => {
        await handleUpdateTension(tensionId, "status", "resolved");
      },
    },
    cancel: {
      label: "新しいアクションを追加",
      onClick: () => {
        const input = document.querySelector(
          `[data-tension-new-action="${tensionId}"]`
        );
        if (input instanceof HTMLInputElement) {
          input.focus();
        }
      },
    },
  });
}

export function useActionHandlers({
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
  handleUpdateTension,
}: {
  chartId: string;
  tensions: Tension[];
  setTensions: React.Dispatch<React.SetStateAction<Tension[]>>;
  looseActions: ActionPlan[];
  setLooseActions: React.Dispatch<React.SetStateAction<ActionPlan[]>>;
  isSubmittingAction: Record<string, boolean>;
  setIsSubmittingAction: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pendingDeletions: Record<string, { type: string; item: any; tensionId?: string | null; timeoutId: NodeJS.Timeout }>;
  setPendingDeletions: React.Dispatch<React.SetStateAction<any>>;
  setTelescopingActionId: React.Dispatch<React.SetStateAction<string | null>>;
  router: ReturnType<typeof useRouter>;
  handleUpdateTension: (tensionId: string, field: "title" | "description" | "status", value: string) => Promise<void>;
}) {
  const tt = useTranslations("toast");
  const handleAddActionPlan = async (
    tensionId: string | null,
    title: string,
    areaId?: string | null
  ) => {
    const submitKey = tensionId ?? "loose";
    if (!title.trim() || isSubmittingAction[submitKey]) return;

    // スクロール位置をユーザー操作時点で保存
    const scrollViewport = document.querySelector('[data-nav-scope="tension-action"]')
      ?.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (scrollViewport) {
      _pendingScrollRestore = scrollViewport.scrollTop;
      setTimeout(() => { _pendingScrollRestore = null; }, 10000);
    }

    setIsSubmittingAction({ ...isSubmittingAction, [submitKey]: true });
    const titleToAdd = title.trim();

    try {
      const newAction = await addActionPlan(tensionId, titleToAdd, areaId, chartId);

      if (newAction) {
        // ローカルState直接更新（router.refresh() を避けてスクロール維持 + 即時反映）
        if (tensionId) {
          setTensions((prev) =>
            prev.map((tension) =>
              tension.id === tensionId
                ? { ...tension, actionPlans: [...tension.actionPlans, newAction] }
                : tension
            )
          );
        } else {
          setLooseActions((prev) => [...prev, newAction]);
        }
      } else {
        console.error("[handleAddActionPlan] 保存失敗");
      }
    } catch (error) {
      console.error("[handleAddActionPlan] エラー:", error);
    } finally {
      setIsSubmittingAction({ ...isSubmittingAction, [submitKey]: false });
    }
  };

  const handleUpdateActionPlan = async (
    tensionId: string | null,
    actionId: string,
    field:
      | "title"
      | "dueDate"
      | "assignee"
      | "status"
      | "hasSubChart"
      | "subChartId"
      | "childChartId"
      | "isCompleted"
      | "description"
      | "areaId",
    value: string | boolean | null,
    options?: { removeFromTension?: boolean }
  ) => {
    const updateActionInState = (
      updater: (action: ActionPlan) => ActionPlan
    ) => {
      setTensions((prev) =>
        prev.map((tension) => ({
          ...tension,
          actionPlans: tension.actionPlans.map((action) =>
            action.id === actionId ? updater(action) : action
          ),
        }))
      );
      setLooseActions((prev) =>
        prev.map((action) => (action.id === actionId ? updater(action) : action))
      );
    };

    if (field === "assignee") {
      updateActionInState((action) => ({
        ...action,
        assignee: value as string,
      }));
      const success = await updateActionPlanItem(
        actionId,
        tensionId,
        field,
        value,
        chartId
      );
      if (!success) {
        console.error("[handleUpdateActionPlan] 更新失敗");
      }
      return;
    }

    if (field === "areaId") {
      const removeFromTension = options?.removeFromTension ?? false;
      if (tensionId && removeFromTension) {
        let movedAction: ActionPlan | null = null;
        setTensions((prev) =>
          prev.map((tension) => {
            if (tension.id !== tensionId) return tension;
            const remainingActions = tension.actionPlans.filter((action) => {
              if (action.id === actionId) {
                movedAction = { ...action, area_id: value as string | null, tension_id: null };
                return false;
              }
              return true;
            });
            return { ...tension, actionPlans: remainingActions };
          })
        );
        if (movedAction) {
          setLooseActions((prev) => (movedAction ? [movedAction, ...prev] : prev));
        }
      } else if (tensionId) {
        setTensions((prev) =>
          prev.map((tension) =>
            tension.id === tensionId
              ? {
                  ...tension,
                  actionPlans: tension.actionPlans.map((action) =>
                    action.id === actionId ? { ...action, area_id: value as string | null } : action
                  ),
                }
              : tension
          )
        );
      } else {
        setLooseActions((prev) =>
          prev.map((action) =>
            action.id === actionId ? { ...action, area_id: value as string | null } : action
          )
        );
      }
      const result = await updateActionArea(
        actionId,
        value as string | null,
        chartId,
        removeFromTension
      );
      if (!result.success) {
        toast.error(tt("moveFailed"), { duration: 5000 });
      }
      return;
    }

    if (field === "status") {
      const nextStatus = value as ActionPlan["status"];
      updateActionInState((action) => ({
        ...action,
        status: nextStatus,
        isCompleted: nextStatus === "done",
      }));
      // 全Action完了検知: 最後のActionをdoneにしたらお祝いトースト
      if (tensionId && nextStatus === "done") {
        const tension = tensions.find((t) => t.id === tensionId);
        if (
          tension &&
          tension.status !== "resolved" &&
          tension.actionPlans.length > 0 &&
          tension.actionPlans.every((a) =>
            a.id === actionId ? true : a.status === "done" || a.isCompleted
          )
        ) {
          showAllActionsCompletedToast(tensionId, handleUpdateTension);
        }
      }
    } else if (field === "isCompleted") {
      const nextIsCompleted = Boolean(value);
      updateActionInState((action) => ({
        ...action,
        isCompleted: nextIsCompleted,
        status: nextIsCompleted ? "done" : action.status,
      }));
      // 全Action完了検知: 最後のActionを完了にしたらお祝いトースト
      if (tensionId && nextIsCompleted) {
        const tension = tensions.find((t) => t.id === tensionId);
        if (
          tension &&
          tension.status !== "resolved" &&
          tension.actionPlans.length > 0 &&
          tension.actionPlans.every((a) =>
            a.id === actionId ? true : a.status === "done" || a.isCompleted
          )
        ) {
          showAllActionsCompletedToast(tensionId, handleUpdateTension);
        }
      }
    }

    // dueDateは楽観的にローカル状態を更新
    if (field === "dueDate") {
      updateActionInState((action) => ({
        ...action,
        dueDate: value as string | undefined,
      }));
    }

    // titleも楽観的にローカル状態を更新（D&D時のstate再構築で古い値に戻るのを防ぐ）
    if (field === "title") {
      updateActionInState((action) => ({
        ...action,
        title: value as string,
      }));
    }

    const success = await updateActionPlanItem(actionId, tensionId, field, value, chartId);
    if (!success) {
      console.error("[handleUpdateActionPlan] 更新失敗");
      // 失敗時はロールバック
      if (field === "dueDate" || field === "status" || field === "isCompleted") {
        router.refresh();
      }
    }
  };

  const handleDeleteActionPlan = async (tensionId: string | null, actionId: string) => {
    // スクロール位置をユーザー操作時点で保存
    const scrollViewport = document.querySelector('[data-nav-scope="tension-action"]')
      ?.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (scrollViewport) {
      _pendingScrollRestore = scrollViewport.scrollTop;
      setTimeout(() => { _pendingScrollRestore = null; }, 10000);
    }
    const action = tensionId
      ? tensions.find((t) => t.id === tensionId)?.actionPlans.find((a) => a.id === actionId)
      : looseActions.find((a) => a.id === actionId);
    if (!action) return;

    // 既存の削除予約があればキャンセル
    const existingKey = `action-${actionId}`;
    if (pendingDeletions[existingKey]) {
      clearTimeout(pendingDeletions[existingKey].timeoutId);
    }

    // 楽観的UI更新（一時的に非表示）
    const originalTensions = [...tensions];
    const originalLooseActions = [...looseActions];
    if (tensionId) {
      const updatedTensions = tensions.map((t) =>
        t.id === tensionId
          ? { ...t, actionPlans: t.actionPlans.filter((a) => a.id !== actionId) }
          : t
      );
      setTensions(updatedTensions);
    } else {
      setLooseActions(looseActions.filter((a) => a.id !== actionId));
    }

    // 15秒後に実際に削除
    const timeoutId = setTimeout(async () => {
      const success = await removeActionPlan(actionId, tensionId, chartId);
      if (success) {
        router.refresh();
      } else {
        // 削除失敗時は元に戻す
        setTensions(originalTensions);
        setLooseActions(originalLooseActions);
        toast.error(tt("deleteFailed"), { duration: 5000 });
      }
      setPendingDeletions((prev: Record<string, any>) => {
        const next = { ...prev };
        delete next[existingKey];
        return next;
      });
    }, 15000);

    // 削除予約を保存
    setPendingDeletions((prev: Record<string, any>) => ({
      ...prev,
      [existingKey]: {
        type: "action",
        item: action,
        tensionId,
        timeoutId,
      },
    }));

    toast.success(tt("actionDeleted"), {
      duration: 15000,
      action: {
        label: tt("undo"),
        onClick: () => {
          clearTimeout(timeoutId);
          setTensions(originalTensions);
          setLooseActions(originalLooseActions);
          setPendingDeletions((prev: Record<string, any>) => {
            const next = { ...prev };
            delete next[existingKey];
            return next;
          });
        },
      },
    });
  };

  const handleTelescopeClick = async (actionPlan: ActionPlan, tensionId: string | null) => {
    // 既に子チャートが存在する場合は遷移
    if (actionPlan.childChartId) {
      router.push(`/charts/${actionPlan.childChartId}`);
      return;
    }

    // ローディング状態を設定
    setTelescopingActionId(actionPlan.id);

    try {
      // テレスコーピング: 新しいチャートを作成
      const newChartId = await telescopeActionPlan(actionPlan.id, tensionId, chartId);

      if (newChartId) {
        // 成功: 新しいチャートに遷移
        router.push(`/charts/${newChartId}`);
      } else {
        // エラー: ローディング状態を解除
        setTelescopingActionId(null);
        console.error("4. Failed - result:", newChartId);
        console.error("Failed to create child chart");
      }
    } catch (error) {
      setTelescopingActionId(null);
      console.error("5. Exception caught:", error);
      console.error("Error in telescope:", error);
    }
  };

  return {
    handleAddActionPlan,
    handleUpdateActionPlan,
    handleDeleteActionPlan,
    handleTelescopeClick,
  };
}
