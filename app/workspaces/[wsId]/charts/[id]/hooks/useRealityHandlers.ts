import type { RealityItem, Area } from "@/types/chart";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addReality, updateRealityItem, removeReality } from "../actions";

export function useRealityHandlers({
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
}: {
  chartId: string;
  realities: RealityItem[];
  setRealities: React.Dispatch<React.SetStateAction<RealityItem[]>>;
  selectedAreaId: string;
  isSubmittingReality: boolean;
  setIsSubmittingReality: React.Dispatch<React.SetStateAction<boolean>>;
  pendingDeletions: Record<string, { type: string; item: any; tensionId?: string | null; timeoutId: NodeJS.Timeout }>;
  setPendingDeletions: React.Dispatch<React.SetStateAction<any>>;
  newRealityInput: { setValue: (val: string) => void };
  chart: { areas: Area[] };
  router: ReturnType<typeof useRouter>;
}) {
  const tt = useTranslations("toast");
  const tTags = useTranslations("tags");
  const handleAddReality = async (content: string, areaIdOverride?: string | null) => {
    if (!content.trim() || isSubmittingReality) return;

    setIsSubmittingReality(true);
    const contentToAdd = content.trim();
    const areaId =
      areaIdOverride !== undefined
        ? (areaIdOverride === "uncategorized" ? null : areaIdOverride)
        : selectedAreaId === "all"
          ? null
          : selectedAreaId;

    // 楽観的にローカルStateを即時更新
    const tempId = `temp-${Date.now()}`;
    const optimisticReality: RealityItem = {
      id: tempId,
      content: contentToAdd,
      createdAt: new Date().toISOString(),
      area_id: areaId,
    };
    setRealities((prev) => [...prev, optimisticReality]);
    if (areaIdOverride === undefined) newRealityInput.setValue("");

    try {
      const newReality = await addReality(chartId, contentToAdd, areaId);
      if (newReality) {
        // 成功: tempIdを実際のIDに置換
        setRealities((prev) =>
          prev.map((r) => (r.id === tempId ? newReality : r))
        );
      } else {
        // 失敗: 楽観的に追加したものを削除
        setRealities((prev) => prev.filter((r) => r.id !== tempId));
        newRealityInput.setValue(contentToAdd);
        console.error("[handleAddReality] 保存失敗 - ロールバック");
      }
    } catch (error) {
      console.error("[handleAddReality] エラー:", error);
      setRealities((prev) => prev.filter((r) => r.id !== tempId));
      newRealityInput.setValue(contentToAdd);
    } finally {
      setIsSubmittingReality(false);
    }
  };

  const handleUpdateReality = async (
    id: string,
    field: "content" | "isLocked" | "areaId" | "dueDate" | "description",
    value: string | boolean | null
  ) => {
    // 楽観的にローカルStateを即時更新
    const originalRealities = [...realities];
    setRealities((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === "content") return { ...r, content: value as string };
        if (field === "isLocked") return { ...r, isLocked: value as boolean };
        if (field === "areaId") return { ...r, area_id: value as string | null };
        if (field === "dueDate") return { ...r, dueDate: (value as string) || undefined };
        if (field === "description") return { ...r, description: value as string };
        return r;
      })
    );
    if (field === "areaId") {
      const areaName = value
        ? chart.areas.find((area: Area) => area.id === value)?.name
        : tTags("untagged");
      toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
    }

    try {
      const success = await updateRealityItem(id, chartId, field, value);
      if (!success) {
        // 失敗: ロールバック
        setRealities(originalRealities);
        if (field === "areaId") toast.error(tt("moveFailed"), { duration: 5000 });
        console.error("[handleUpdateReality] 更新失敗 - ロールバック");
      }
    } catch (error) {
      setRealities(originalRealities);
      if (field === "areaId") toast.error(tt("moveFailed"), { duration: 5000 });
      console.error("[handleUpdateReality] エラー:", error);
    }
  };

  const handleDeleteReality = async (id: string) => {
    const reality = realities.find((r) => r.id === id);
    if (!reality) return;

    // 既存の削除予約があればキャンセル
    const existingKey = `reality-${id}`;
    if (pendingDeletions[existingKey]) {
      clearTimeout(pendingDeletions[existingKey].timeoutId);
    }

    // 楽観的UI更新（一時的に非表示）
    const originalRealities = [...realities];
    setRealities(realities.filter((r) => r.id !== id));

    // 15秒後に実際に削除
    const timeoutId = setTimeout(async () => {
      const success = await removeReality(id, chartId);
      if (success) {
        router.refresh();
      } else {
        // 削除失敗時は元に戻す
        setRealities(originalRealities);
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
        type: "reality",
        item: reality,
        timeoutId,
      },
    }));

    toast.success(tt("realityDeleted"), {
      duration: 15000,
      action: {
        label: tt("undo"),
        onClick: () => {
          clearTimeout(timeoutId);
          setRealities(originalRealities);
          setPendingDeletions((prev: Record<string, any>) => {
            const next = { ...prev };
            delete next[existingKey];
            return next;
          });
        },
      },
    });
  };

  return { handleAddReality, handleUpdateReality, handleDeleteReality };
}
