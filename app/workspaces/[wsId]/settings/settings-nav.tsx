"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings, Archive, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsNav({ wsId }: { wsId: string }) {
  const t = useTranslations("settings");
  const pathname = usePathname();

  const slackEnabled = !!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;

  const tabs = [
    {
      label: t("generalTab"),
      href: `/workspaces/${wsId}/settings/general`,
      icon: Settings,
      active:
        pathname === `/workspaces/${wsId}/settings` ||
        pathname === `/workspaces/${wsId}/settings/general`,
    },
    {
      label: t("archiveTab"),
      href: `/workspaces/${wsId}/settings/archive`,
      icon: Archive,
      active: pathname === `/workspaces/${wsId}/settings/archive`,
    },
    ...(slackEnabled
      ? [
          {
            label: t("slackTab"),
            href: `/workspaces/${wsId}/settings/slack`,
            icon: MessageSquare,
            active: pathname === `/workspaces/${wsId}/settings/slack`,
          },
        ]
      : []),
  ];

  return (
    <nav className="flex gap-1 border-b border-zenshin-navy/10 mb-8">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab.active
              ? "border-zenshin-navy text-zenshin-navy"
              : "border-transparent text-zenshin-navy/40 hover:text-zenshin-navy/70 hover:border-zenshin-navy/20"
          )}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
