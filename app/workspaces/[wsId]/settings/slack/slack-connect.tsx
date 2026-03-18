"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { disconnectSlack } from "./actions";
import {
  MessageSquare,
  Unplug,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type SlackSettings = {
  id: string;
  workspace_id: string;
  slack_team_id: string;
  slack_team_name: string | null;
  slack_bot_token: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
  daily_enabled: boolean;
  daily_times: string[];
  daily_timezone: string;
  weekly_enabled: boolean;
  weekly_time: string;
  weekly_day: number;
  weekly_timezone: string;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

interface SlackConnectProps {
  wsId: string;
  isOwner: boolean;
  slackSettings: SlackSettings | null;
  justConnected: boolean;
  error?: string;
}

export function SlackConnect({
  wsId,
  isOwner,
  slackSettings,
  justConnected,
  error,
}: SlackConnectProps) {
  const t = useTranslations("slackSettings");
  // Use a ref instead of useState to avoid triggering React re-renders.
  // Re-rendering the component tree (including the Next.js Router) can trigger
  // a React 19 core bug (facebook/react#33580).
  const isDisconnectingRef = useRef(false);
  const isConnected = !!slackSettings;

  const handleConnect = () => {
    window.location.href = `/api/slack/authorize?wsId=${wsId}`;
  };

  const handleDisconnect = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!confirm(t("disconnectConfirm"))) return;
    if (isDisconnectingRef.current) return;
    isDisconnectingRef.current = true;

    // Update button via DOM to avoid React re-render
    const button = e.currentTarget;
    button.disabled = true;
    button.textContent = t("disconnecting");

    try {
      await disconnectSlack(wsId);
      toast.success(t("disconnected"));
      window.location.reload();
    } catch {
      toast.error(t("disconnectFailed"));
      isDisconnectingRef.current = false;
      button.disabled = false;
      button.textContent = t("disconnect");
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-red-700">
            {t("connectionFailed")}
          </h3>
        </div>
        <p className="text-sm text-red-600 mb-4">
          {t("connectionFailedDesc")}
        </p>
        <Button onClick={handleConnect} variant="outline" size="sm">
          {t("retryConnect")}
        </Button>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-700">{t("connected")}</h3>
          </div>
          {isOwner && (
            <Button
              onClick={handleDisconnect}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Unplug className="w-4 h-4 mr-1" />
              {t("disconnect")}
            </Button>
          )}
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <p>
            {t("slackWorkspace")}:{" "}
            <span className="font-medium text-gray-900">
              {slackSettings.slack_team_name || slackSettings.slack_team_id}
            </span>
          </p>
          {slackSettings.slack_channel_name && (
            <p>
              {t("channel")}:{" "}
              <span className="font-medium text-gray-900">
                #{slackSettings.slack_channel_name}
              </span>
            </p>
          )}
          {!slackSettings.slack_channel_id && (
            <p className="text-amber-600">{t("channelNotSet")}</p>
          )}
        </div>
        {justConnected && (
          <div className="mt-4 p-3 bg-green-100 rounded-md text-sm text-green-700">
            {t("justConnectedMessage")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-zenshin-navy" />
        <h3 className="font-semibold text-zenshin-navy">{t("title")}</h3>
      </div>
      <p className="text-sm text-gray-600 mb-6">{t("description")}</p>

      {isOwner ? (
        <>
          <Button
            onClick={handleConnect}
            className="bg-[#4A154B] hover:bg-[#3a1139] text-white mb-6"
          >
            <svg
              className="w-4 h-4 mr-2"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.521-2.522v-2.522h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" />
            </svg>
            {t("connectButton")}
          </Button>

          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              {t("setupGuideTitle")}
            </h4>
            <ol className="text-sm text-gray-500 space-y-2 list-decimal list-inside">
              <li>{t("setupStep1")}</li>
              <li>{t("setupStep2")}</li>
              <li>{t("setupStep3")}</li>
              <li>{t("setupStep4")}</li>
              <li>{t("setupStep5")}</li>
            </ol>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">{t("ownerOnly")}</p>
      )}
    </div>
  );
}
