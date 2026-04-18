"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { getChartDisplayTitle } from "@/lib/chart-display";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardChartFilterProps = {
  charts: { id: string; title: string }[];
  selectedChartId: string;
};

export function DashboardChartFilter({
  charts,
  selectedChartId,
}: DashboardChartFilterProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("chartId");
    } else {
      params.set("chartId", value);
    }
    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      router.push(newUrl, { scroll: false });
    });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 transition-opacity",
        isPending && "opacity-70 pointer-events-none"
      )}
    >
      <Select value={selectedChartId} onValueChange={handleChange}>
      <SelectTrigger className="w-[220px] border-zenshin-navy/15 text-zenshin-navy [&>span]:truncate">
        <SelectValue placeholder={t("all")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("all")}</SelectItem>
        {charts.map((chart) => (
          <SelectItem key={chart.id} value={chart.id}>
            {getChartDisplayTitle(chart, tc)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
      {isPending && (
        <Loader2 className="h-4 w-4 animate-spin text-zenshin-navy/50 shrink-0" />
      )}
    </div>
  );
}
