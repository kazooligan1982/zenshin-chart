"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bot, X, Send, Loader2, Sparkles, ArrowLeft, Target, MessageCircle, Plus, Wand2, Lightbulb, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChartDataForAI } from "@/lib/ai/collect-chart-data";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface StructurizeResult {
  visions: { title: string }[];
  realities: { title: string }[];
  tensions: { title: string; category?: string }[];
  actions: { title: string; tensionIndex?: number }[];
}

interface CreateStructurizeResult {
  visions: { title: string; enabled: boolean }[];
  realities: { title: string; enabled: boolean }[];
  tensions: { title: string; category: string; enabled: boolean }[];
  actions: { title: string; tensionIndex: number; enabled: boolean }[];
}

export type StructuredItems = StructurizeResult;

export interface SnapshotEscalationContext {
  type: "snapshot_escalation";
  snapshotId: string;
  analysisResult: string;
  snapshotData: any;
  chartName: string;
}

export interface ComparisonEscalationContext {
  type: "comparison_escalation";
  analysisResult: string;
  comparisonData: any;
  chartName: string;
}

export type EscalationContext = SnapshotEscalationContext | ComparisonEscalationContext;

interface ExtractedVRTAItem {
  title: string;
  description: string;
  due_date?: string | null;
  enabled: boolean;
}

interface ExtractedVRTA {
  visions: ExtractedVRTAItem[];
  realities: ExtractedVRTAItem[];
  tensions: ExtractedVRTAItem[];
  actions: ExtractedVRTAItem[];
}

interface AICoachButtonProps {
  chartData: ChartDataForAI;
  chartId?: string;
  onAddItems?: (items: StructurizeResult) => Promise<void>;
}

type ViewMode = "select" | "analyze" | "brainstorm" | "add" | "create";

export function AICoachButton({ chartData, chartId, onAddItems }: AICoachButtonProps) {
  const t = useTranslations("aiCoach");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("select");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [addText, setAddText] = useState("");
  const [addResult, setAddResult] = useState<StructurizeResult | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [createText, setCreateText] = useState("");
  const [createResult, setCreateResult] = useState<CreateStructurizeResult | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createApplying, setCreateApplying] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [escalationContext, setEscalationContext] = useState<EscalationContext | null>(null);
  const [extractedVrta, setExtractedVrta] = useState<ExtractedVRTA | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showBrainstormPreview, setShowBrainstormPreview] = useState(false);
  const [isApplyingVrta, setIsApplyingVrta] = useState(false);
  const [editingField, setEditingField] = useState<{ section: string; index: number; field: "title" | "description" } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (input === "" && inputRef.current && viewMode === "brainstorm") {
      inputRef.current.style.height = "auto";
    }
  }, [input, viewMode]);

  useEffect(() => {
    if (isOpen && inputRef.current && (viewMode === "analyze" || viewMode === "brainstorm")) {
      inputRef.current.focus();
    }
  }, [isOpen, viewMode]);

  const sendChatMessageRef = useRef<((userMessage?: string, contextOverride?: EscalationContext | null) => void) | null>(null);

  useEffect(() => {
    const handleOpenCoach = (e: Event) => {
      const { initialContext } = (e as CustomEvent).detail || {};
      setIsOpen(true);
      setViewMode("brainstorm");
      setEscalationContext(initialContext ?? null);
      setMessages([]);
      const initialPrompt =
        locale === "ja"
          ? "この分析結果について深掘りしたいです。"
          : "I'd like to dig deeper into this analysis.";
      setInput("");
      requestAnimationFrame(() => {
        if (sendChatMessageRef.current) {
          sendChatMessageRef.current(initialPrompt, initialContext);
        }
      });
    };

    window.addEventListener("open-ai-coach", handleOpenCoach as EventListener);
    return () => window.removeEventListener("open-ai-coach", handleOpenCoach as EventListener);
  }, [locale]);

  const resetInternalState = useCallback(() => {
    setViewMode("select");
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setAddText("");
    setAddResult(null);
    setIsAdding(false);
    setCreateText("");
    setCreateResult(null);
    setCreateLoading(false);
    setCreateApplying(false);
    setCreateError(null);
    setEscalationContext(null);
    setExtractedVrta(null);
    setIsExtracting(false);
    setShowBrainstormPreview(false);
    setIsApplyingVrta(false);
    setEditingField(null);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(resetInternalState, 300);
  }, [resetInternalState]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, handleClose]);

  const handleOpen = () => {
    resetInternalState();
    setIsOpen(true);
  };

  const handleBack = () => {
    setViewMode("select");
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setIsExtracting(false);
    setShowBrainstormPreview(false);
    setExtractedVrta(null);
    setAddText("");
    setAddResult(null);
    setIsAdding(false);
    setCreateText("");
    setCreateResult(null);
    setCreateLoading(false);
    setCreateApplying(false);
    setCreateError(null);
    setEditingField(null);
  };

  const sendAnalyzeMessage = async (userMessage?: string) => {
    const messageToSend = userMessage ?? input.trim();
    if (!messageToSend && messages.length === 0) return;

    const newMessages: Message[] =
      messages.length > 0
        ? [...messages, { role: "user" as const, content: messageToSend }]
        : [{ role: "user" as const, content: messageToSend }];

    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartData,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          language: locale,
          mode: "analyze",
        }),
      });

      if (!res.ok) {
        throw new Error("API request failed");
      }

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.response },
      ]);
    } catch (error) {
      console.error("AI Coach error:", error);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: locale === "en"
            ? "Sorry, an error occurred. Please try again."
            : "申し訳ありません、エラーが発生しました。もう一度お試しください。",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendChatMessage = async (userMessage?: string, contextOverride?: EscalationContext | null) => {
    const messageToSend = userMessage ?? input.trim();
    if (!messageToSend) return;

    const newMessages: Message[] =
      contextOverride
        ? [{ role: "user" as const, content: messageToSend }]
        : [...messages, { role: "user" as const, content: messageToSend }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    const ctx = contextOverride ?? escalationContext;

    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartData,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          language: locale,
          mode: "chat",
          initialContext: ctx ?? undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("API request failed");
      }

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.response },
      ]);
      if (ctx) setEscalationContext(null);
    } catch (error) {
      console.error("AI Coach error:", error);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: locale === "en"
            ? "Sorry, an error occurred. Please try again."
            : "申し訳ありません、エラーが発生しました。もう一度お試しください。",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  sendChatMessageRef.current = sendChatMessage;

  const handleCategorize = async () => {
    if (!addText.trim()) return;
    setIsLoading(true);
    setAddResult(null);

    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: addText.trim(),
          language: locale,
          mode: "structurize",
        }),
      });

      if (!res.ok) {
        throw new Error("API request failed");
      }

      const data = await res.json();
      setAddResult(data);
    } catch (error) {
      console.error("Structurize error:", error);
      setAddResult({
        visions: [],
        realities: [],
        tensions: [],
        actions: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAdd = async () => {
    if (!addResult || !onAddItems) return;
    setIsAdding(true);
    try {
      await onAddItems(addResult);
      setAddResult(null);
      setAddText("");
      setViewMode("select");
    } catch (error) {
      console.error("Add items error:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateAnalyze = async () => {
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/ai/structurize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: createText, language: locale }),
      });
      if (!res.ok) throw new Error("AI analysis failed");
      const data = await res.json();
      setCreateResult({
        visions: (data.visions || []).map((v: { title?: string }) => ({ ...v, title: v.title || "", enabled: true })),
        realities: (data.realities || []).map((r: { title?: string }) => ({ ...r, title: r.title || "", enabled: true })),
        tensions: (data.tensions || []).map((t: { title?: string; category?: string }) => ({ ...t, title: t.title || "", category: t.category || "uncategorized", enabled: true })),
        actions: (data.actions || []).map((a: { title?: string; tensionIndex?: number }) => ({ ...a, title: a.title || "", tensionIndex: a.tensionIndex ?? 0, enabled: true })),
      });
    } catch {
      setCreateError(locale === "en" ? "Analysis failed. Please try again." : "分析に失敗しました。もう一度お試しください。");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateApply = async () => {
    if (!createResult || !chartId) return;
    setCreateApplying(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/ai/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartId,
          visions: createResult.visions.filter((v) => v.enabled).map((v) => ({ title: v.title })),
          realities: createResult.realities.filter((r) => r.enabled).map((r) => ({ title: r.title })),
          tensions: createResult.tensions.filter((t) => t.enabled).map((t) => ({ title: t.title })),
          actions: createResult.actions.filter((a) => a.enabled).map((a) => ({ title: a.title, tensionIndex: a.tensionIndex })),
        }),
      });
      if (!res.ok) throw new Error("Apply failed");
      setCreateText("");
      setCreateResult(null);
      setViewMode("select");
      window.location.reload();
    } catch {
      setCreateError(locale === "en" ? "Failed to apply. Please try again." : "適用に失敗しました。もう一度お試しください。");
    } finally {
      setCreateApplying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (viewMode === "analyze") sendAnalyzeMessage();
      else if (viewMode === "brainstorm") sendChatMessage();
    }
  };

  const handleReflectToChart = async () => {
    setIsExtracting(true);
    setShowBrainstormPreview(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "extract_vrta",
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          language: locale,
          chartId,
        }),
      });
      if (!res.ok) throw new Error("API request failed");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExtractedVrta({
        visions: (data.visions || []).map((v: { title?: string; description?: string }) => ({ ...v, title: v.title || "", description: v.description || "", enabled: true })),
        realities: (data.realities || []).map((r: { title?: string; description?: string }) => ({ ...r, title: r.title || "", description: r.description || "", enabled: true })),
        tensions: (data.tensions || []).map((t: { title?: string; description?: string }) => ({ ...t, title: t.title || "", description: t.description || "", enabled: true })),
        actions: (data.actions || []).map((a: { title?: string; description?: string; due_date?: string | null }) => ({ ...a, title: a.title || "", description: a.description || "", enabled: true })),
      });
    } catch (error) {
      console.error("VRTA extraction error:", error);
      toast.error(t("brainstorm.extractFailed"));
      setShowBrainstormPreview(false);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddToCurrentChart = async () => {
    if (!extractedVrta || !onAddItems) return;
    setIsApplyingVrta(true);
    try {
      const items: StructurizeResult = {
        visions: extractedVrta.visions.filter((v) => v.enabled).map((v) => ({ title: v.title })),
        realities: extractedVrta.realities.filter((r) => r.enabled).map((r) => ({ title: r.title })),
        tensions: extractedVrta.tensions.filter((t) => t.enabled).map((t) => ({ title: t.title })),
        actions: extractedVrta.actions.filter((a) => a.enabled).map((a) => ({ title: a.title })),
      };
      await onAddItems(items);
      toast.success(t("brainstorm.addedToChart"));
      setShowBrainstormPreview(false);
      setExtractedVrta(null);
    } catch (error) {
      console.error("Apply VRTA error:", error);
      toast.error(t("brainstorm.addFailed"));
    } finally {
      setIsApplyingVrta(false);
    }
  };

  const handleBackToBrainstorm = () => {
    setShowBrainstormPreview(false);
    setEditingField(null);
  };

  const updateVrtaItem = (section: keyof ExtractedVRTA, index: number, field: string, value: string | boolean) => {
    setExtractedVrta((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: prev[section].map((item, i) =>
          i === index ? { ...item, [field]: value } : item
        ),
      };
    });
  };

  const handleTextareaInput = () => {
    const textarea = inputRef.current;
    if (textarea && viewMode === "brainstorm") {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 144) + "px";
    }
  };

  const renderContent = () => {
    if (viewMode === "select") {
      return (
        <div className="p-4 space-y-3">
          <p className="text-sm font-medium text-zenshin-navy">{t("modeSelect.title")}</p>
          <div className="space-y-2">
            <button
              onClick={() => {
                setViewMode("brainstorm");
                setMessages([]);
              }}
              className="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-violet-50 hover:border-violet-200 transition-colors flex gap-3"
            >
              <MessageCircle className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-zenshin-navy">{t("modeSelect.brainstorm")}</p>
                <p className="text-xs text-zenshin-navy/60">{t("modeSelect.brainstormDesc")}</p>
              </div>
            </button>
            <button
              onClick={() => setViewMode("create")}
              className="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-violet-50 hover:border-violet-200 transition-colors flex gap-3"
            >
              <Wand2 className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-zenshin-navy">{t("modeCreate")}</p>
                <p className="text-xs text-zenshin-navy/60">{t("modeCreateDesc")}</p>
              </div>
            </button>
            <button
              onClick={() => setViewMode("add")}
              className="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-violet-50 hover:border-violet-200 transition-colors flex gap-3"
            >
              <Plus className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-zenshin-navy">{t("modeSelect.add")}</p>
                <p className="text-xs text-zenshin-navy/60">{t("modeSelect.addDesc")}</p>
              </div>
            </button>
            <button
              onClick={() => {
                setViewMode("analyze");
                setMessages([]);
                sendAnalyzeMessage(
                  locale === "en"
                    ? "Please analyze this chart and provide coaching."
                    : "このチャートを分析してコーチングしてください。"
                );
              }}
              className="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-violet-50 hover:border-violet-200 transition-colors flex gap-3"
            >
              <Target className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-zenshin-navy">{t("modeSelect.analyze")}</p>
                <p className="text-xs text-zenshin-navy/60">{t("modeSelect.analyzeDesc")}</p>
              </div>
            </button>
          </div>
        </div>
      );
    }

    if (viewMode === "create") {
      return (
        <div className="flex-1 flex flex-col min-h-0 p-4">
          <p className="text-sm text-gray-600 mb-3">{t("createDescription")}</p>
          <textarea
            value={createText}
            onChange={(e) => setCreateText(e.target.value)}
            placeholder={t("createPlaceholder")}
            className="flex-1 min-h-[120px] p-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            autoFocus
          />
          {createError && <p className="text-sm text-red-500 mt-2">{createError}</p>}
          {createResult && (
            <div className="mt-3 space-y-2 overflow-y-auto max-h-[300px]">
              {createResult.visions.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-teal-600">Vision ({createResult.visions.filter((v) => v.enabled).length})</span>
                  {createResult.visions.map((v, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm py-1 block">
                      <input
                        type="checkbox"
                        checked={v.enabled}
                        onChange={() => {
                          setCreateResult((prev) =>
                            prev ? { ...prev, visions: prev.visions.map((item, idx) => (idx === i ? { ...item, enabled: !item.enabled } : item)) } : null
                          );
                        }}
                        className="rounded"
                      />
                      <span className={v.enabled ? "" : "line-through text-gray-400"}>{v.title}</span>
                    </label>
                  ))}
                </div>
              )}
              {createResult.realities.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-orange-600">Reality ({createResult.realities.filter((r) => r.enabled).length})</span>
                  {createResult.realities.map((r, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm py-1 block">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => {
                          setCreateResult((prev) =>
                            prev ? { ...prev, realities: prev.realities.map((item, idx) => (idx === i ? { ...item, enabled: !item.enabled } : item)) } : null
                          );
                        }}
                        className="rounded"
                      />
                      <span className={r.enabled ? "" : "line-through text-gray-400"}>{r.title}</span>
                    </label>
                  ))}
                </div>
              )}
              {createResult.tensions.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-indigo-600">Tension ({createResult.tensions.filter((t) => t.enabled).length})</span>
                  {createResult.tensions.map((t, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm py-1 block">
                      <input
                        type="checkbox"
                        checked={t.enabled}
                        onChange={() => {
                          setCreateResult((prev) =>
                            prev ? { ...prev, tensions: prev.tensions.map((item, idx) => (idx === i ? { ...item, enabled: !item.enabled } : item)) } : null
                          );
                        }}
                        className="rounded"
                      />
                      <span className={t.enabled ? "" : "line-through text-gray-400"}>{t.title}</span>
                    </label>
                  ))}
                </div>
              )}
              {createResult.actions.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-blue-600">Action ({createResult.actions.filter((a) => a.enabled).length})</span>
                  {createResult.actions.map((a, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm py-1 block">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={() => {
                          setCreateResult((prev) =>
                            prev ? { ...prev, actions: prev.actions.map((item, idx) => (idx === i ? { ...item, enabled: !item.enabled } : item)) } : null
                          );
                        }}
                        className="rounded"
                      />
                      <span className={a.enabled ? "" : "line-through text-gray-400"}>{a.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-3 shrink-0">
            {!createResult ? (
              <button
                onClick={handleCreateAnalyze}
                disabled={createLoading || createText.trim().length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {createLoading ? t("analyzing") : t("analyze")}
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setCreateResult(null);
                    setCreateError(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {t("retry")}
                </button>
                <button
                  onClick={handleCreateApply}
                  disabled={createApplying || !chartId}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {createApplying ? t("applying") : t("applyToChart")}
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    if (viewMode === "add") {
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 overflow-y-auto flex-1">
            {!addResult ? (
              <>
                <p className="text-sm text-zenshin-navy/80 mb-3">{t("add.description")}</p>
                <Textarea
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder={t("add.placeholder")}
                  className="min-h-[120px] resize-none text-sm"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleCategorize}
                  disabled={isLoading || !addText.trim()}
                  className="mt-3 w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {t("add.categorizing")}
                    </>
                  ) : (
                    t("add.submit")
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-zenshin-navy">{t("add.preview")}</p>
                {addResult.visions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-violet-600 mb-1">Vision</p>
                    <ul className="text-sm space-y-1">
                      {addResult.visions.map((v, i) => (
                        <li key={i} className="pl-2 border-l-2 border-violet-200">• {v.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {addResult.realities.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-teal-600 mb-1">Reality</p>
                    <ul className="text-sm space-y-1">
                      {addResult.realities.map((r, i) => (
                        <li key={i} className="pl-2 border-l-2 border-teal-200">• {r.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {addResult.tensions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-600 mb-1">Tension</p>
                    <ul className="text-sm space-y-1">
                      {addResult.tensions.map((t, i) => (
                        <li key={i} className="pl-2 border-l-2 border-amber-200">• {t.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {addResult.actions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-blue-600 mb-1">Action</p>
                    <ul className="text-sm space-y-1">
                      {addResult.actions.map((a, i) => (
                        <li key={i} className="pl-2 border-l-2 border-blue-200">• {a.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAddResult(null)}
                    disabled={isAdding}
                    className="flex-1"
                  >
                    {t("add.discard")}
                  </Button>
                  <Button
                    onClick={handleConfirmAdd}
                    disabled={isAdding || !onAddItems}
                    className="flex-1"
                  >
                    {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : t("add.confirm")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // analyze or brainstorm
    const isAnalyze = viewMode === "analyze";
    const isBrainstorm = viewMode === "brainstorm";
    const sendMessage = isAnalyze ? sendAnalyzeMessage : sendChatMessage;
    const greeting = isAnalyze ? t("greeting") : isBrainstorm ? t("brainstorm.emptyState") : t("chat.greeting");
    const placeholder = isAnalyze ? t("inputPlaceholder") : isBrainstorm ? t("brainstorm.placeholder") : t("chat.inputPlaceholder");
    const userMessageCount = messages.filter((m) => m.role === "user").length;
    const showReflectButton = isBrainstorm && userMessageCount >= 3 && !isLoading;

    if (isBrainstorm && showBrainstormPreview) {
      const vrtaSections: { key: keyof ExtractedVRTA; label: string; color: string; borderColor: string; dotColor: string }[] = [
        { key: "visions", label: "Vision", color: "text-emerald-700", borderColor: "border-emerald-200", dotColor: "bg-emerald-500" },
        { key: "realities", label: "Reality", color: "text-orange-700", borderColor: "border-orange-200", dotColor: "bg-orange-500" },
        { key: "tensions", label: "Tension", color: "text-sky-700", borderColor: "border-sky-200", dotColor: "bg-sky-500" },
        { key: "actions", label: "Action", color: "text-slate-700", borderColor: "border-slate-200", dotColor: "bg-slate-500" },
      ];

      if (isExtracting || !extractedVrta) {
        return (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-zenshin-navy">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>{t("brainstorm.extractingPreview")}</span>
              </div>

              {vrtaSections.map(({ key, label, color, dotColor }, idx) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", dotColor, "opacity-40")} />
                    <span className={cn("text-xs font-semibold opacity-40", color)}>{label}</span>
                  </div>
                  {[0, 1].map((j) => (
                    <div
                      key={j}
                      className="rounded-lg border p-3 space-y-2 animate-pulse border-gray-100 bg-gray-50/50"
                      style={{ animationDelay: `${idx * 150 + j * 100}ms` }}
                    >
                      <div className="h-4 bg-gray-200/60 rounded w-3/4" />
                      <div className="h-3 bg-gray-200/40 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t p-3 shrink-0 space-y-2">
              <button
                disabled
                className="w-full py-2.5 px-4 bg-emerald-600/50 text-white rounded-xl flex items-center justify-center gap-2 text-sm font-medium opacity-50 cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("brainstorm.extracting")}
              </button>
              <button
                onClick={handleBackToBrainstorm}
                className="w-full py-2 px-4 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition-colors text-sm"
              >
                {t("brainstorm.backToBrainstorm")}
              </button>
            </div>
          </>
        );
      }

      return (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-sm font-medium text-zenshin-navy">{t("brainstorm.previewTitle")}</p>
            {vrtaSections.map(({ key, label, color, borderColor, dotColor }, sectionIdx) => {
              const items = extractedVrta[key];
              if (items.length === 0) return null;
              return (
                <div
                  key={key}
                  className="space-y-2 animate-fadeIn"
                  style={{ animationDelay: `${sectionIdx * 300}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", dotColor)} />
                    <span className={cn("text-xs font-semibold", color)}>{label}</span>
                  </div>
                  {items.map((item, i) => (
                    <div key={i} className={cn("rounded-lg border p-3 space-y-1", borderColor, !item.enabled && "opacity-50")}>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => updateVrtaItem(key, i, "enabled", !item.enabled)}
                          className="mt-0.5 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          {editingField?.section === key && editingField.index === i && editingField.field === "title" ? (
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => updateVrtaItem(key, i, "title", e.target.value)}
                              onBlur={() => setEditingField(null)}
                              onKeyDown={(e) => { if (e.key === "Enter") setEditingField(null); }}
                              className="w-full text-sm font-medium border-b border-gray-300 focus:border-violet-500 focus:outline-none py-0.5"
                              autoFocus
                            />
                          ) : (
                            <p
                              className="text-sm font-medium cursor-pointer hover:text-violet-600 flex items-center gap-1"
                              onClick={() => setEditingField({ section: key, index: i, field: "title" })}
                            >
                              {item.title}
                              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-400" />
                            </p>
                          )}
                          {editingField?.section === key && editingField.index === i && editingField.field === "description" ? (
                            <textarea
                              value={item.description}
                              onChange={(e) => updateVrtaItem(key, i, "description", e.target.value)}
                              onBlur={() => setEditingField(null)}
                              className="w-full text-xs text-gray-600 border-b border-gray-300 focus:border-violet-500 focus:outline-none py-0.5 resize-none"
                              rows={2}
                              autoFocus
                            />
                          ) : (
                            item.description && (
                              <p
                                className="text-xs text-gray-500 cursor-pointer hover:text-gray-700"
                                onClick={() => setEditingField({ section: key, index: i, field: "description" })}
                              >
                                {item.description}
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="border-t p-3 shrink-0 space-y-2">
            <button
              onClick={handleAddToCurrentChart}
              disabled={isApplyingVrta || !onAddItems}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-2 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isApplyingVrta ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t("applying")}</>
              ) : (
                <><Check className="w-4 h-4" />{t("brainstorm.addToChart")}</>
              )}
            </button>
            <button
              onClick={handleBackToBrainstorm}
              disabled={isApplyingVrta}
              className="w-full py-2 px-4 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition-colors text-sm"
            >
              {t("brainstorm.backToBrainstorm")}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {escalationContext && escalationContext.type === "snapshot_escalation" && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm">
              <p className="font-medium text-indigo-800 flex items-center gap-1.5">
                <span>📸</span>
                {locale === "ja" ? "スナップショット分析からの続き" : "Continued from snapshot analysis"}
              </p>
              {escalationContext.chartName && (
                <p className="text-indigo-600/80 mt-0.5 text-xs">
                  {locale === "ja" ? "チャート" : "Chart"}: {escalationContext.chartName}
                </p>
              )}
            </div>
          )}
          {escalationContext && escalationContext.type === "comparison_escalation" && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm">
              <p className="font-medium text-indigo-800 flex items-center gap-1.5">
                <span>📊</span>
                {locale === "ja" ? "スナップショット比較分析からの続き" : "Continued from snapshot comparison analysis"}
              </p>
              {escalationContext.chartName && (
                <p className="text-indigo-600/80 mt-0.5 text-xs">
                  {locale === "ja" ? "チャート" : "Chart"}: {escalationContext.chartName}
                </p>
              )}
            </div>
          )}
          {messages.length === 0 && !isLoading && !escalationContext && (
            <div className="text-center text-gray-400 text-sm mt-8">
              <Sparkles className="w-8 h-8 mx-auto mb-3 text-violet-300" />
              <p>{greeting}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-violet-50 text-violet-900 rounded-2xl rounded-br-md px-4 py-2.5 ml-8"
                  : "text-gray-700"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t("analyzing")}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showReflectButton && (
          <div className="px-4 pb-2">
            <button
              onClick={handleReflectToChart}
              disabled={isExtracting}
              className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 flex items-center justify-center gap-2 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isExtracting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t("brainstorm.extracting")}</>
              ) : (
                <><Lightbulb className="w-4 h-4" />{t("brainstorm.reflectToChart")}</>
              )}
            </button>
          </div>
        )}

        <div className="border-t p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                "flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300",
                viewMode === "brainstorm"
                  ? "min-h-[48px] max-h-[144px] overflow-y-auto"
                  : "max-h-24"
              )}
              rows={viewMode === "brainstorm" ? 2 : 1}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-[100000] w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          title={t("title")}
        >
          <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
        </button>
      )}

      {isOpen && (
        <>
        <div
          className="fixed inset-0 z-[99998]"
          onClick={handleClose}
        />
        <div className={cn(
          "fixed z-[100000] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden",
          viewMode === "brainstorm"
            ? "inset-x-2 bottom-2 top-auto h-[90vh] sm:inset-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-2xl sm:h-[80vh]"
            : "bottom-6 right-6 w-[380px] h-[560px]"
        )}>
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              {viewMode !== "select" && (
                <button
                  onClick={handleBack}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <Bot className="w-5 h-5" />
              <span className="font-bold text-sm">{t("title")}</span>
            </div>
            <button
              onClick={handleClose}
              className="-m-1 p-2 hover:bg-white/20 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {renderContent()}
        </div>
        </>
      )}
    </>
  );
}
