"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Send, Paperclip, AtSign, Link, Bot } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { createComment, createRealityComment, createVisionComment } from "@/app/charts/[id]/actions";
import {
  searchWorkspaceItems,
  searchWorkspaceMembers,
  searchWorkspaceCharts,
} from "@/lib/workspace-search";
import type { TimelineComment } from "@/types/database";

interface CommentInputProps {
  type: "action" | "vision" | "reality";
  itemId: string;
  chartId: string;
  workspaceId: string;
  currentUserId: string;
  currentUser?: { id?: string; email: string; name?: string; avatar_url?: string | null } | null;
  onOptimisticAdd?: (comment: TimelineComment) => void;
  onPersisted?: () => void;
  onFailed?: (tempId: string) => void;
}

// Editor パネルヘッダーと統一: Vision=Target(teal), Reality=Search(orange), Tension=Zap(navy), Action=Play(blue)
const MENTION_ICONS: Record<string, { svg: string; color: string }> = {
  vision: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    color: "#23967F",
  },
  reality: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    color: "#F5853F",
  },
  tension: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    color: "#154665",
  },
  action: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>',
    color: "#3b82f6",
  },
  chart: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    color: "#64748b",
  },
  user: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    color: "#64748b",
  },
};

type MentionTab = "people" | "items" | "charts";

type MentionItem = {
  id: string;
  label: string;
  type: string;
  title: string;
  chartTitle?: string;
  chartId?: string;
};

function createMentionSuggestion(
  workspaceId: string,
  chartId: string,
  t: (key: string) => string
) {
  return {
    char: "@",
    items: async ({ query }: { query: string }) => {
      if (!chartId) return [];
      const results = await searchWorkspaceItems(workspaceId || "none", query, chartId);
      return results.map((item) => ({
        id: `${item.type}:${item.chartId}:${item.id}`,
        label: item.title,
        type: item.type,
        title: item.title,
        chartTitle: item.chartTitle,
        chartId: item.chartId,
      })).slice(0, 10);
    },
    render: () => {
      let component: HTMLDivElement | null = null;
      let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
      let selectedIndex = 0;
      let noResultTimer: ReturnType<typeof setTimeout> | null = null;
      let confirmedEmpty = false;
      let activeTab: MentionTab = "items";
      let displayItems: MentionItem[] = [];
      let currentQuery = "";
      let command: (item: { id: string; label: string }) => void = () => {};

      async function fetchTabItems(tab: MentionTab, query: string): Promise<MentionItem[]> {
        if (tab === "people") {
          const members = await searchWorkspaceMembers(workspaceId, query);
          return members.map((m) => ({
            id: m.id,
            label: m.title,
            type: "user",
            title: m.title,
          }));
        }
        if (tab === "charts") {
          const charts = await searchWorkspaceCharts(workspaceId, query);
          return charts.map((c) => ({
            id: `chart:${c.chartId}:${c.id}`,
            label: c.title,
            type: "chart",
            title: c.title,
            chartTitle: c.chartTitle,
            chartId: c.chartId,
          }));
        }
        const results = await searchWorkspaceItems(workspaceId, query, chartId);
        return results.map((item) => ({
          id: `${item.type}:${item.chartId}:${item.id}`,
          label: item.title,
          type: item.type,
          title: item.title,
          chartTitle: item.chartTitle,
          chartId: item.chartId,
        }));
      }

      function renderItemList(items: MentionItem[]) {
        const iconConfig = (type: string) =>
          MENTION_ICONS[type] || MENTION_ICONS.chart;
        if (items.length === 0) {
          return confirmedEmpty
            ? `<div class="px-3 py-2 text-sm text-gray-400">${t("mentionNoResults")}</div>`
            : `<div class="px-3 py-2 text-sm text-gray-400">${t("mentionSearching")}</div>`;
        }
        return items.slice(0, 15).map((item, index) => {
          const itemType = item.type || (item.id || "").split(":")[0] || "chart";
          const { svg, color } = iconConfig(itemType);
          return `<div class="px-3 py-2 text-sm rounded cursor-pointer flex items-center gap-3 min-w-[350px] ${
            index === selectedIndex ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
          }" data-index="${index}">
  <span class="flex items-center justify-center shrink-0 w-6 h-6 rounded" style="background:${color}20;color:${color}">${svg}</span>
  <span class="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title="${(item.title || "").replace(/"/g, "&quot;")}">${(item.title || "").replace(/</g, "&lt;")}</span>
</div>`;
        }).join("");
      }

      async function updateDropdown() {
        if (!component) return;
        const tabsHtml = `
          <div class="flex border-b border-gray-200 mb-1">
            <button type="button" class="mention-tab px-3 py-1.5 text-sm ${activeTab === "people" ? "border-b-2 border-blue-500 font-medium text-blue-600" : "text-gray-600"}" data-tab="people">${t("mentionPeople")}</button>
            <button type="button" class="mention-tab px-3 py-1.5 text-sm ${activeTab === "items" ? "border-b-2 border-blue-500 font-medium text-blue-600" : "text-gray-600"}" data-tab="items">${t("mentionItems")}</button>
            <button type="button" class="mention-tab px-3 py-1.5 text-sm ${activeTab === "charts" ? "border-b-2 border-blue-500 font-medium text-blue-600" : "text-gray-600"}" data-tab="charts">${t("mentionCharts")}</button>
          </div>
          <div class="px-2 py-1 text-xs text-gray-500">${t("searchMention")} ${currentQuery ? `"${currentQuery.replace(/"/g, "&quot;")}"` : ""}</div>
        `;
        component.innerHTML = tabsHtml + `<div class="mention-list max-h-[220px] overflow-y-auto">${renderItemList(displayItems)}</div>`;

        component.querySelectorAll(".mention-tab").forEach((el) => {
          el.addEventListener("click", async (e) => {
            const tab = (e.currentTarget as HTMLElement).getAttribute("data-tab") as MentionTab;
            activeTab = tab;
            selectedIndex = 0;
            confirmedEmpty = false;
            displayItems = await fetchTabItems(tab, currentQuery);
            if (displayItems.length === 0 && currentQuery) {
              noResultTimer = setTimeout(() => {
                confirmedEmpty = true;
                updateDropdown();
              }, 500);
            }
            updateDropdown();
          });
        });

        component.querySelectorAll("[data-index]").forEach((el) => {
          el.addEventListener("click", () => {
            const idx = parseInt(el.getAttribute("data-index") || "0", 10);
            if (displayItems[idx]) command({ id: displayItems[idx].id, label: displayItems[idx].label });
          });
        });
      }

      return {
        onStart: async (props: any) => {
          command = props.command;
          currentQuery = (props.query ?? props.decorationNode?.text?.slice(1) ?? "") as string;
          activeTab = "items";
          selectedIndex = 0;
          confirmedEmpty = false;
          if (noResultTimer) { clearTimeout(noResultTimer); noResultTimer = null; }

          component = document.createElement("div");
          component.className =
            "mention-dropdown bg-white border rounded-lg shadow-lg p-2 max-h-[320px] z-[9999] min-w-[380px]";
          displayItems = await fetchTabItems("items", currentQuery);
          if (displayItems.length === 0 && currentQuery) {
            noResultTimer = setTimeout(() => {
              confirmedEmpty = true;
              updateDropdown();
            }, 1000);
          }
          updateDropdown();

          const { view } = props.editor;
          const editorDom = view.dom;
          const coords = view.coordsAtPos(props.range.from);
          component.style.position = "fixed";
          component.style.left = `${coords.left}px`;
          component.style.top = "auto";
          component.style.bottom = `${window.innerHeight - coords.top + 4}px`;
          document.body.appendChild(component);

          const closeDropdown = () => {
            if (noResultTimer) {
              clearTimeout(noResultTimer);
              noResultTimer = null;
            }
            component?.remove();
            component = null;
          };

          clickOutsideHandler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!component || !target) return;
            const clickedInsideDropdown = component.contains(target);
            const clickedInsideEditor = editorDom.contains(target);
            if (!clickedInsideDropdown && !clickedInsideEditor) {
              if (clickOutsideHandler) {
                document.removeEventListener("mousedown", clickOutsideHandler, true);
                clickOutsideHandler = null;
              }
              closeDropdown();
              props.editor.commands.blur();
            }
          };

          document.addEventListener("mousedown", clickOutsideHandler, true);
        },
        onUpdate: async (props: any) => {
          command = props.command;
          const newQuery = (props.query ?? props.decorationNode?.text?.slice(1) ?? "") as string;
          if (newQuery !== currentQuery) {
            currentQuery = newQuery;
            selectedIndex = 0;
            confirmedEmpty = false;
            if (noResultTimer) { clearTimeout(noResultTimer); noResultTimer = null; }
            displayItems = await fetchTabItems(activeTab, currentQuery);
            if (displayItems.length === 0 && currentQuery) {
              noResultTimer = setTimeout(() => {
                confirmedEmpty = true;
                updateDropdown();
              }, 500);
            }
          }
          updateDropdown();
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "ArrowUp") {
            selectedIndex = (selectedIndex - 1 + displayItems.length) % Math.max(displayItems.length, 1);
            updateDropdown();
            return true;
          }
          if (props.event.key === "ArrowDown") {
            selectedIndex = (selectedIndex + 1) % Math.max(displayItems.length, 1);
            updateDropdown();
            return true;
          }
          if (props.event.key === "Enter") {
            if (displayItems[selectedIndex]) {
              command({ id: displayItems[selectedIndex].id, label: displayItems[selectedIndex].label });
            }
            return true;
          }
          return false;
        },
        onExit: () => {
          if (clickOutsideHandler) {
            document.removeEventListener("mousedown", clickOutsideHandler, true);
            clickOutsideHandler = null;
          }
          if (noResultTimer) { clearTimeout(noResultTimer); noResultTimer = null; }
          component?.remove();
          component = null;
        },
      };
    },
  };
}

export function CommentInput({
  type,
  itemId,
  chartId,
  workspaceId,
  currentUserId,
  currentUser,
  onOptimisticAdd,
  onPersisted,
  onFailed,
}: CommentInputProps) {
  const t = useTranslations("timeline");
  const tMention = useTranslations("mention");
  const tToast = useTranslations("toast");
  const commentPlaceholder = t("commentPlaceholder");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const handleSubmitRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const mentionSuggestionRef = useRef(
    createMentionSuggestion(workspaceId, chartId, (k: string) => tMention(k))
  );

  useEffect(() => {
    mentionSuggestionRef.current = createMentionSuggestion(
      workspaceId, chartId, (k: string) => tMention(k)
    );
  }, [workspaceId, chartId]); // tMention は参照が不安定なため意図的に除外

  const editor = useEditor({
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        hardBreak: false,
        trailingNode: false,
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: commentPlaceholder,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        renderHTML({ options, node }) {
          const idParts = (node.attrs.id || "").split(":");
          const type = idParts[0] || "";
          return [
            "span",
            {
              ...options.HTMLAttributes,
              "data-type": "mention",
              "data-id": node.attrs.id,
              "data-mention-type": type,
            },
            `@${node.attrs.label ?? node.attrs.id}`,
          ];
        },
        suggestion: mentionSuggestionRef.current as any,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[60px] max-h-[200px] overflow-y-auto p-2 border-0 rounded-t-lg text-sm focus:ring-0",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          handleSubmitRef.current();
          return true;
        }
        return false;
      },
    },
  }, [workspaceId]);

  const handleMentionClick = () => {
    editor?.chain().focus().run();
    const dom = editor?.view.dom;
    if (dom) {
      dom.focus();
      document.execCommand("insertText", false, "@");
    } else {
      editor?.chain().focus().insertContent("@").run();
    }
  };

  const handleLinkInsert = (urlToInsert: string) => {
    const url = urlToInsert.trim();
    if (!url) return;
    const href = url.startsWith("http") ? url : `https://${url}`;
    const escaped = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (editor?.state.selection.empty) {
      editor?.chain().focus().insertContent(`<a href="${escaped}" target="_blank" rel="noopener">${escaped}</a>`).run();
    } else {
      editor?.chain().focus().setLink({ href }).run();
    }
    setLinkUrl("");
    setLinkPopoverOpen(false);
  };

  const handleSubmit = async () => {
    if (!editor?.getHTML || editor.isEmpty || isSubmitting) return;
    const htmlContent = editor.getHTML().trim();
    if (!htmlContent || htmlContent === "<p></p>") return;

    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimisticComment: TimelineComment = {
      id: tempId,
      user_id: currentUserId,
      content: htmlContent,
      created_at: now,
      updated_at: now,
      profile: {
        id: currentUserId,
        email: currentUser?.email || "",
        name: currentUser?.name || null,
        avatar_url: currentUser?.avatar_url || null,
      },
      ...(type === "action" && { action_id: itemId }),
      ...(type === "vision" && { vision_id: itemId }),
      ...(type === "reality" && { reality_id: itemId }),
    };

    onOptimisticAdd?.(optimisticComment);
    editor.commands.clearContent();
    setIsSubmitting(true);

    let result;
    switch (type) {
      case "vision":
        result = await createVisionComment(itemId, htmlContent, chartId);
        break;
      case "reality":
        result = await createRealityComment(itemId, htmlContent, chartId);
        break;
      case "action":
      default:
        result = await createComment(itemId, htmlContent, chartId);
    }

    setIsSubmitting(false);
    if (result.success) {
      onPersisted?.();
      editor.commands.focus();
    } else {
      onFailed?.(tempId);
      editor.commands.setContent(htmlContent);
      toast.error(tToast("createFailed"), { duration: 5000 });
    }
    setTimeout(() => editor.commands.focus(), 0);
  };

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    return () => {
      document.querySelectorAll(".mention-dropdown").forEach((el) => el.remove());
    };
  }, []);

  return (
    <div className="flex gap-2">
      <div className="flex-1 border border-zenshin-navy/15 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 disabled:opacity-50 overflow-hidden">
        <EditorContent editor={editor} />
        <div className="flex items-center gap-1 px-2 py-1.5 border-t border-gray-100">
          <button
            type="button"
            disabled
            className="p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/40 cursor-not-allowed opacity-40"
            title={tMention("attachFile")}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleMentionClick}
            className="p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/70 hover:text-zenshin-navy"
            title="@"
          >
            <AtSign className="w-4 h-4" />
          </button>
          <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/70 hover:text-zenshin-navy"
                title={tMention("insertLink")}
              >
                <Link className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start" side="top">
              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground">
                  URL
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLinkInsert(linkUrl);
                      setLinkPopoverOpen(false);
                    }
                    if (e.key === "Escape") setLinkPopoverOpen(false);
                  }}
                  placeholder="https://..."
                  className="w-full h-8 px-2 text-sm rounded border border-zenshin-navy/15"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkPopoverOpen(false)}
                    className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {tMention("linkCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleLinkInsert(linkUrl);
                      setLinkPopoverOpen(false);
                    }}
                    disabled={!linkUrl.trim()}
                    className="px-3 py-1 text-sm bg-zenshin-teal text-white rounded hover:bg-zenshin-teal/90 disabled:opacity-50"
                  >
                    {tMention("linkInsert")}
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            disabled
            className="p-1.5 rounded hover:bg-zenshin-navy/5 text-zenshin-navy/40 cursor-not-allowed opacity-40"
            title={tMention("askAI")}
          >
            <Bot className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => void handleSubmit()}
            disabled={isEmpty || isSubmitting}
            className="shrink-0 px-3 py-1 bg-zenshin-teal text-white rounded text-sm font-medium hover:bg-zenshin-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            title={t("sendTitle")}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("send")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
