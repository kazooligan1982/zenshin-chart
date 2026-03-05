"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateSlackNotify } from "./actions";

interface SlackNotificationToggleProps {
  wsId: string;
  initialEnabled: boolean;
  canEdit: boolean;
}

export function SlackNotificationToggle({
  wsId,
  initialEnabled,
  canEdit,
}: SlackNotificationToggleProps) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(initialEnabled);

  const handleChange = async (checked: boolean) => {
    if (!canEdit) return;
    setEnabled(checked);
    await updateSlackNotify(wsId, checked);
  };

  return (
    <div className="rounded-lg border border-zenshin-navy/10 bg-zenshin-cream/30 p-4 mb-8">
      <div className="flex items-center gap-3 mb-2">
        <Bell className="w-5 h-5 text-zenshin-navy/40" />
        <h2 className="text-lg font-semibold text-zenshin-navy">
          {t("slackNotification")}
        </h2>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label
          htmlFor="slack-notify"
          className="text-sm text-zenshin-navy/80 cursor-pointer flex-1"
        >
          {t("slackNotificationDescription")}
        </Label>
        <Switch
          id="slack-notify"
          checked={enabled}
          onCheckedChange={handleChange}
          disabled={!canEdit}
        />
      </div>
    </div>
  );
}
