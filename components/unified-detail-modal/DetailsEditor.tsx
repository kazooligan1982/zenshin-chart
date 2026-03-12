"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { FileText, Wand2, Loader2 } from "lucide-react";
import { marked } from "marked";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

interface DetailsEditorProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  itemTitle?: string;
  itemContext?: string;
  chartId?: string;
}

export function DetailsEditor({
  value,
  onSave,
  placeholder,
  itemTitle,
  itemContext,
  chartId,
}: DetailsEditorProps) {
  // marked設定: 同期的にHTMLを返す
  marked.setOptions({ async: false, breaks: true });

  const t = useTranslations("modal");
  const locale = useLocale();
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const placeholderText = placeholder ?? t("detailsPlaceholder");

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestValueRef = useRef(value);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  // 親のvalueが変わったら追跡
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const debouncedSave = useCallback((html: string) => {
    const trimmed = html === "<p></p>" ? "" : html;
    if (trimmed === latestValueRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      latestValueRef.current = trimmed;
      onSave(trimmed);
    }, 500);
  }, [onSave]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          hardBreak: false,
          trailingNode: false,
          bulletList: { keepMarks: true, keepAttributes: false },
          orderedList: { keepMarks: true, keepAttributes: false },
        }),
        Placeholder.configure({ placeholder: placeholderText }),
      ],
      content: value || "<p></p>",
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none min-h-[80px] p-3 text-sm",
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.stopPropagation();
            return false;
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => {
        debouncedSave(e.getHTML());
      },
      onBlur: ({ editor: e }) => {
        // blur時は即保存（デバウンスをキャンセルして即実行）
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        const html = e.getHTML();
        const trimmed = html === "<p></p>" ? "" : html;
        if (trimmed !== latestValueRef.current) {
          latestValueRef.current = trimmed;
          onSave(trimmed);
        }
      },
      immediatelyRender: false,
    },
    []
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor && value !== undefined) {
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    }
  }, [editor, value]);

  // アンマウント時に未保存の内容があれば即保存
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // アンマウント時にeditorの現在値を保存
      const e = editorRef.current;
      if (e) {
        const html = e.getHTML();
        const trimmed = html === "<p></p>" ? "" : html;
        if (trimmed !== latestValueRef.current) {
          onSaveRef.current(trimmed);
        }
      }
    };
  }, []);

  const handleAiAssist = async () => {
    if (!editor || isAiGenerating) return;
    setIsAiGenerating(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          chartId,
          chartData: {},
          messages: [
            {
              role: "user",
              content: locale === "ja"
                ? `以下のアイテムについて、背景と目的を整理して、Detailsの下書きを書いてください。簡潔に、箇条書きは使わず文章で記述してください。\n\nタイトル: ${itemTitle}\n\nコンテキスト:\n${itemContext}`
                : `Please organize the background and purpose of this item, and write a draft for the Details section. Be concise, use prose instead of bullet points.\n\nTitle: ${itemTitle}\n\nContext:\n${itemContext}`,
            },
          ],
          language: locale,
        }),
      });
      if (!res.ok) throw new Error("AI assist failed");
      const data = await res.json();
      if (data.response && editor) {
        // MarkdownをHTMLに変換
        const htmlFromMarkdown = marked.parse(data.response) as string;
        const currentContent = editor.getHTML();
        const newContent = currentContent === "<p></p>" || !currentContent
          ? htmlFromMarkdown
          : `${currentContent}${htmlFromMarkdown}`;
        editor.commands.setContent(newContent);
        const finalHtml = editor.getHTML();
        const trimmed = finalHtml === "<p></p>" ? "" : finalHtml;
        latestValueRef.current = trimmed;
        onSave(trimmed);
      }
    } catch (error) {
      console.error("[DetailsEditor] AI assist error:", error);
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-500">{t("details")}</h3>
        {itemTitle && chartId && (
          <button
            type="button"
            onClick={handleAiAssist}
            disabled={isAiGenerating}
            className="ml-auto flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 disabled:opacity-50 transition-colors"
            title={t("aiAssistDetails")}
          >
            {isAiGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span>{isAiGenerating ? t("aiGenerating") : t("aiAssistDetails")}</span>
          </button>
        )}
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none w-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:ring-0 [&_.ProseMirror:focus]:outline-none [&_.ProseMirror:focus]:ring-0 [&_.ProseMirror:focus]:shadow-none [&_.ProseMirror:focus]:border-transparent border rounded-lg focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent"
      />
    </div>
  );
}
