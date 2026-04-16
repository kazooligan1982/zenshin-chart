"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FocusModeProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sectionType: "vision" | "reality" | "tension";
  initialContent: string;
  onSave: (content: string) => void;
};

export function FocusModeModal({
  isOpen,
  onClose,
  title,
  sectionType,
  initialContent,
  onSave,
}: FocusModeProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useTranslations("editor");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSaveAndClose = () => {
    onSave(content);
    onClose();
  };

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSaveAndClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, content, handleSaveAndClose]);

  if (!isOpen) return null;

  const sectionColors = {
    vision: "border-blue-500/50",
    reality: "border-green-500/50",
    tension: "border-yellow-500/50",
  };

  const sectionLabels = {
    vision: t("vision"),
    reality: t("reality"),
    tension: t("tensionAndAction"),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSaveAndClose}
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-3xl mx-4 bg-background rounded-2xl shadow-2xl border-2",
          sectionColors[sectionType]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Maximize2 className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {sectionLabels[sectionType]}
              </p>
              <h2 className="text-lg font-bold">{title}</h2>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSaveAndClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`${sectionLabels[sectionType]}を記述してください...`}
            className="min-h-[400px] text-lg leading-relaxed resize-none border-0 shadow-none focus-visible:ring-0 p-0"
          />
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground">
            ESC または背景クリックで保存して閉じる
          </p>
          <Button onClick={handleSaveAndClose}>保存して閉じる</Button>
        </div>
      </div>
    </div>
  );
}
