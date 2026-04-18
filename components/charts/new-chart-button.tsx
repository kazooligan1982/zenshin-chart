"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createChart } from "@/lib/charts-actions";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NewChartButton({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const t = useTranslations("home");
  const tt = useTranslations("toast");
  const tc = useTranslations("common");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateChart = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const chart = await createChart(tc("untitled_chart"), workspaceId);
      toast.success(tt("chartCreated"), { duration: 3000 });
      router.push(workspaceId ? `/workspaces/${workspaceId}/charts/${chart.id}` : `/charts/${chart.id}`);
    } catch (error) {
      console.error("Failed to create chart:", error);
      toast.error(tt("chartCreateFailed"), { duration: 5000 });
      setIsCreating(false);
    }
  };

  return (
    <Button
      onClick={handleCreateChart}
      disabled={isCreating}
      className="gap-2 bg-zenshin-orange hover:bg-zenshin-orange/90 text-white rounded-xl shadow-sm"
    >
      {isCreating ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("creating")}
        </>
      ) : (
        <>
          <Plus className="w-4 h-4" />
          {t("createChart")}
        </>
      )}
    </Button>
  );
}
