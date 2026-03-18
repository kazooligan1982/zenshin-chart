"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { createChart } from "@/app/charts/actions";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NewChartButton({ workspaceId }: { workspaceId?: string }) {
  const t = useTranslations("home");
  const tt = useTranslations("toast");
  // Use a ref instead of useState to avoid triggering React re-renders.
  // Re-rendering the component tree (including the Next.js Router) can trigger
  // a React 19 core bug (facebook/react#33580).
  const isCreatingRef = useRef(false);

  const handleCreateChart = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;

    // Update button via DOM to avoid React re-render
    const button = e.currentTarget;
    button.disabled = true;
    const originalHTML = button.innerHTML;
    button.innerHTML = `<span class="w-4 h-4 animate-spin inline-block border-2 border-current border-t-transparent rounded-full mr-2"></span>${t("creating")}`;

    try {
      const chart = await createChart("無題のチャート", workspaceId);
      toast.success(tt("chartCreated"), { duration: 3000 });
      // Use window.location.href to bypass the Next.js Router and avoid
      // the React 19 hooks bug (facebook/react#33580).
      window.location.href = workspaceId
        ? `/workspaces/${workspaceId}/charts/${chart.id}`
        : `/charts/${chart.id}`;
    } catch (error) {
      console.error("Failed to create chart:", error);
      toast.error(tt("chartCreateFailed"), { duration: 5000 });
      isCreatingRef.current = false;
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  };

  return (
    <Button
      onClick={handleCreateChart}
      className="gap-2 bg-zenshin-orange hover:bg-zenshin-orange/90 text-white rounded-xl shadow-sm"
    >
      <Plus className="w-4 h-4" />
      {t("createChart")}
    </Button>
  );
}
