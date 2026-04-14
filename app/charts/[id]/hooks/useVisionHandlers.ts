import type { VisionItem, Area } from "@/types/chart";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addVision, updateVisionItem, removeVision } from "../actions";

export function useVisionHandlers({
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
}: {
  chartId: string;
  visions: VisionItem[];
  setVisions: React.Dispatch<React.SetStateAction<VisionItem[]>>;
  selectedAreaId: string;
  isSubmittingVision: boolean;
  setIsSubmittingVision: React.Dispatch<React.SetStateAction<boolean>>;
  pendingDeletions: Record<string, { type: string; item: any; tensionId?: string | null; timeoutId: NodeJS.Timeout }>;
  setPendingDeletions: React.Dispatch<React.SetStateAction<any>>;
  newVisionInput: { setValue: (val: string) => void };
  chart: { areas: Area[] };
  router: ReturnType<typeof useRouter>;
}) {
  const tt = useTranslations("toast");
  const tTags = useTranslations("tags");
  const handleAddVision = async (content: string, areaIdOverride?: string | null) => {
    if (!content.trim() || isSubmittingVision) return;

    setIsSubmittingVision(true);
    const contentToAdd = content.trim();
    const areaId =
      areaIdOverride !== undefined
        ? (areaIdOverride === "uncategorized" ? null : areaIdOverride)
        : selectedAreaId === "all"
          ? null
          : selectedAreaId;

    // 楽観的にローカルStateを即時更新
    const tempId = `temp-${Date.now()}`;
    const optimisticVision: VisionItem = {
      id: tempId,
      content: contentToAdd,
      createdAt: new Date().toISOString(),
      area_id: areaId,
    };
    setVisions((prev) => [...prev, optimisticVision]);
    if (areaIdOverride === undefined) newVisionInput.setValue("");

    try {
      const newVision = await addVision(chartId, contentToAdd, areaId);
      if (newVision) {
        // 成功: tempIdを実際のIDに置換
        setVisions((prev) =>
          prev.map((v) => (v.id === tempId ? newVision : v))
        );
      } else {
        // 失敗: 楽観的に追加したものを削除
        setVisions((prev) => prev.filter((v) => v.id !== tempId));
        newVisionInput.setValue(contentToAdd);
        console.error("[handleAddVision] 保存失敗 - ロールバック");
      }
    } catch (error) {
      console.error("[handleAddVision] エラー:", error);
      setVisions((prev) => prev.filter((v) => v.id !== tempId));
      newVisionInput.setValue(contentToAdd);
    } finally {
      setIsSubmittingVision(false);
    }
  };

  const handleUpdateVision = async (
    id: string,
    field: "content" | "assignee" | "dueDate" | "targetDate" | "isLocked" | "areaId" | "description",
    value: string | boolean | null
  ) => {
    // 楽観的にローカル状態を即座に更新
    if (field === "assignee" || field === "dueDate" || field === "targetDate" || field === "description") {
      setVisions((prev) =>
        prev.map((vision) =>
          vision.id === id ? { ...vision, [field]: value } : vision
        )
      );
    }
    if (field === "areaId") {
      const previousState = visions;
      const areaName = value
        ? chart.areas.find((area: Area) => area.id === value)?.name
        : tTags("untagged");
      // 楽観的に即座にタグ位置を変更（UIは即反映）
      setVisions((prev) =>
        prev.map((vision) =>
          vision.id === id ? { ...vision, area_id: value as string | null } : vision
        )
      );
      toast.success(tt("movedToArea", { areaName: areaName ?? tTags("untagged") }), { duration: 3000 });
      try {
        const success = await updateVisionItem(id, chartId, field, value);
        if (!success) {
          setVisions(previousState);
          toast.error(tt("moveFailed"), { duration: 5000 });
          console.error("[handleUpdateVision] 更新失敗");
        }
        // router.refresh() 不要 — revalidatePathがサーバー側で自動処理
      } catch (error) {
        console.error("[handleUpdateVision] エラー:", error);
        setVisions(previousState);
        toast.error(tt("moveFailed"), { duration: 5000 });
      }
      return;
    }
    const success = await updateVisionItem(id, chartId, field, value);
    if (success) {
      // isLockedが変更された場合のみrefresh
      if (field === "isLocked") {
        router.refresh();
      }
    } else {
      console.error("[handleUpdateVision] 更新失敗");
      // 失敗時はロールバック
      if (field === "assignee" || field === "dueDate" || field === "targetDate" || field === "description") {
        router.refresh();
      }
    }
  };

  const handleDeleteVision = async (id: string) => {
    const vision = visions.find((v) => v.id === id);
    if (!vision) return;

    // 既存の削除予約があればキャンセル
    const existingKey = `vision-${id}`;
    if (pendingDeletions[existingKey]) {
      clearTimeout(pendingDeletions[existingKey].timeoutId);
    }

    // 楽観的UI更新（一時的に非表示）
    const originalVisions = [...visions];
    setVisions(visions.filter((v) => v.id !== id));

    // 15秒後に実際に削除
    const timeoutId = setTimeout(async () => {
      const success = await removeVision(id, chartId);
      if (success) {
        router.refresh();
      } else {
        // 削除失敗時は元に戻す
        setVisions(originalVisions);
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
        type: "vision",
        item: vision,
        timeoutId,
      },
    }));

    toast.success(tt("visionDeleted"), {
      duration: 15000,
      action: {
        label: tt("undo"),
        onClick: () => {
          clearTimeout(timeoutId);
          setVisions(originalVisions);
          setPendingDeletions((prev: Record<string, any>) => {
            const next = { ...prev };
            delete next[existingKey];
            return next;
          });
        },
      },
    });
  };

  return { handleAddVision, handleUpdateVision, handleDeleteVision };
}
