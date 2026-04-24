"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Link2,
  ChevronRight,
  Github,
  Figma,
  FileText,
  Trello,
  ExternalLink,
  X,
  Slack,
} from "lucide-react";
import { ClickUpIcon, NotionIcon, JiraIcon, LinearIcon, AsanaIcon } from "@/components/icons/service-icons";
import { toast } from "sonner";
import { getItemLinks, addItemLink, deleteItemLink, type ItemLink } from "@/app/workspaces/[wsId]/charts/[id]/actions";
import type { ItemType } from "./ModalHeader";
import { logger } from "@/lib/logger";

interface LinkedResourcesProps {
  chartId: string;
  itemType: ItemType;
  itemId: string;
  onActivityChange?: () => void;
}

function getServiceIcon(service: string | null) {
  switch (service) {
    case "github":
      return <Github className="w-4 h-4 shrink-0" />;
    case "clickup":
      return <ClickUpIcon className="w-4 h-4 shrink-0" />;
    case "notion":
      return <NotionIcon className="w-4 h-4 shrink-0" />;
    case "figma":
      return <Figma className="w-4 h-4 shrink-0" />;
    case "slack":
      return <Slack className="w-4 h-4 shrink-0" />;
    case "jira":
      return <JiraIcon className="w-4 h-4 shrink-0" />;
    case "linear":
      return <LinearIcon className="w-4 h-4 shrink-0" />;
    case "trello":
      return <Trello className="w-4 h-4 shrink-0" />;
    case "google_docs":
    case "google_sheets":
    case "google_slides":
      return <FileText className="w-4 h-4 shrink-0 text-blue-500" />;
    case "asana":
      return <AsanaIcon className="w-4 h-4 shrink-0" />;
    default:
      return <ExternalLink className="w-4 h-4 shrink-0 text-gray-400" />;
  }
}

function shortenUrl(url: string, maxLen = 50) {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length <= maxLen) return path;
    return path.slice(0, maxLen - 3) + "...";
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 3) + "..." : url;
  }
}

export function LinkedResources({
  chartId,
  itemType,
  itemId,
  onActivityChange,
}: LinkedResourcesProps) {
  const t = useTranslations("modal");
  const tToast = useTranslations("toast");
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getItemLinks(itemType, itemId);
      setLinks(data);
      if (data.length > 0) {
        setIsExpanded(true);
      }
    } catch (error) {
      logger.error("[LinkedResources] load error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [itemType, itemId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleAdd = async () => {
    const url = inputValue.trim();
    if (!url) return;

    const urlPattern = /^https?:\/\//i;
    if (!urlPattern.test(url)) {
      toast.error(tToast("invalidUrl") || "有効なURLを入力してください");
      return;
    }

    setIsAdding(true);
    setInputValue("");
    try {
      const newLink = await addItemLink(chartId, itemType, itemId, url);
      setLinks((prev) => [newLink, ...prev]);
      toast.success(t("linkAdded"));
      onActivityChange?.();
    } catch (error) {
      logger.error("[LinkedResources] add error:", error);
      toast.error(tToast("error") || "エラーが発生しました");
      setInputValue(url);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = async (linkId: string) => {
    try {
      await deleteItemLink(linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success(t("linkRemoved"));
      onActivityChange?.();
    } catch (error) {
      logger.error("[LinkedResources] delete error:", error);
      toast.error(tToast("error") || "エラーが発生しました");
    }
  };

  const displayTitle = (link: ItemLink) =>
    link.title?.trim() || shortenUrl(link.url);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        <Link2 className="w-4 h-4" />
        <span>{t("linkedResources")}</span>
        {links.length > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{links.length}</span>
        )}
      </button>
      {isExpanded && (
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 mt-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <>
            {links.length > 0 && (
              <ul className="space-y-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center gap-2 group text-sm"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-100 hover:text-zenshin-teal transition-colors cursor-pointer"
                    >
                      <span className="text-zenshin-navy/60 shrink-0">
                        {getServiceIcon(link.service)}
                      </span>
                      <span className="truncate" title={link.url}>
                        {displayTitle(link)}
                      </span>
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemove(link.id)}
                      className="p-1 rounded hover:bg-zenshin-navy/10 text-zenshin-navy/40 hover:text-zenshin-navy transition-colors shrink-0"
                      title={t("removeLink")}
                      aria-label={t("removeLink")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <input
                type="url"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("pasteLink")}
                className="w-full h-8 px-2.5 text-sm rounded-md border border-zenshin-navy/15 bg-white focus:outline-none focus:ring-1 focus:ring-zenshin-teal/50 placeholder:text-muted-foreground"
                disabled={isAdding}
              />
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
