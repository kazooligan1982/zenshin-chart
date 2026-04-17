"use client";

import { useState } from "react";
import {
  Wand2,
  X,
  Check,
  RotateCcw,
  Loader2,
  Target,
  Search,
  Zap,
  Play,
  Pencil,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface StructurizeResult {
  visions: { title: string; enabled: boolean }[];
  realities: { title: string; enabled: boolean }[];
  tensions: { title: string; category: string; enabled: boolean }[];
  actions: { title: string; tensionIndex: number; enabled: boolean }[];
}

interface AiStructurizeModalProps {
  chartId: string;
  language: string;
  initialText?: string;
  onTextChange?: (text: string) => void;
  onClose: () => void;
  onStructurized: () => void;
}

export function AiStructurizeModal({
  chartId,
  language,
  initialText = "",
  onTextChange,
  onClose,
  onStructurized,
}: AiStructurizeModalProps) {
  const t = useTranslations("ai");
  const [step, setStep] = useState<"input" | "review">("input");
  const [inputText, setInputText] = useState(initialText);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StructurizeResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (text: string) => {
    setInputText(text);
    onTextChange?.(text);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/structurize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, language }),
      });
      if (!res.ok) throw new Error("AI analysis failed");
      const data = await res.json();
      setResult({
        visions: (data.visions || []).map((v: { title?: string }) => ({
          ...v,
          title: v.title || "",
          enabled: true,
        })),
        realities: (data.realities || []).map((r: { title?: string }) => ({
          ...r,
          title: r.title || "",
          enabled: true,
        })),
        tensions: (data.tensions || []).map((t: { title?: string; category?: string }) => ({
          ...t,
          title: t.title || "",
          category: t.category || "uncategorized",
          enabled: true,
        })),
        actions: (data.actions || []).map((a: { title?: string; tensionIndex?: number }) => ({
          ...a,
          title: a.title || "",
          tensionIndex: a.tensionIndex ?? 0,
          enabled: true,
        })),
      });
      setStep("review");
    } catch {
      setError(t("analysisError"));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartId,
          visions: result.visions.filter((v) => v.enabled).map((v) => ({ title: v.title })),
          realities: result.realities.filter((r) => r.enabled).map((r) => ({ title: r.title })),
          tensions: result.tensions.filter((t) => t.enabled).map((t) => ({ title: t.title })),
          actions: result.actions.filter((a) => a.enabled).map((a) => ({
            title: a.title,
            tensionIndex: a.tensionIndex,
          })),
          source: "manual", // TODO: ai_structurize + structural_diagnosis 対応時に元に戻す (ClickUp: 86ex9e5xn)
        }),
      });
      if (!res.ok) throw new Error("Apply failed");
      onStructurized();
    } catch {
      setError(t("applyError"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-teal-600" />
            <h2 className="font-semibold text-gray-900">
              {step === "input" ? t("inputTitle") : t("reviewTitle")}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "input" && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                {t("inputDescription")}
              </p>
              <textarea
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder={t("inputPlaceholder")}
                className="w-full h-48 p-4 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}
            </div>
          )}

          {step === "review" && result && (
            <div className="space-y-6">
              <ReviewSection
                icon={<Target className="w-4 h-4 text-teal-500" />}
                label="Vision"
                items={result.visions}
                onToggle={(i) => {
                  setResult({
                    ...result,
                    visions: result.visions.map((v, idx) =>
                      idx === i ? { ...v, enabled: !v.enabled } : v
                    ),
                  });
                }}
                onEdit={(i, title) => {
                  setResult({
                    ...result,
                    visions: result.visions.map((v, idx) =>
                      idx === i ? { ...v, title } : v
                    ),
                  });
                }}
                color="teal"
              />

              <ReviewSection
                icon={<Search className="w-4 h-4 text-orange-500" />}
                label="Reality"
                items={result.realities}
                onToggle={(i) => {
                  setResult({
                    ...result,
                    realities: result.realities.map((r, idx) =>
                      idx === i ? { ...r, enabled: !r.enabled } : r
                    ),
                  });
                }}
                onEdit={(i, title) => {
                  setResult({
                    ...result,
                    realities: result.realities.map((r, idx) =>
                      idx === i ? { ...r, title } : r
                    ),
                  });
                }}
                color="orange"
              />

              <ReviewSection
                icon={<Zap className="w-4 h-4 text-indigo-500" />}
                label="Tension"
                items={result.tensions}
                onToggle={(i) => {
                  setResult({
                    ...result,
                    tensions: result.tensions.map((t, idx) =>
                      idx === i ? { ...t, enabled: !t.enabled } : t
                    ),
                  });
                }}
                onEdit={(i, title) => {
                  setResult({
                    ...result,
                    tensions: result.tensions.map((t, idx) =>
                      idx === i ? { ...t, title } : t
                    ),
                  });
                }}
                color="indigo"
              />

              <ReviewSection
                icon={<Play className="w-4 h-4 text-blue-500" />}
                label="Action"
                items={result.actions}
                onToggle={(i) => {
                  setResult({
                    ...result,
                    actions: result.actions.map((a, idx) =>
                      idx === i ? { ...a, enabled: !a.enabled } : a
                    ),
                  });
                }}
                onEdit={(i, title) => {
                  setResult({
                    ...result,
                    actions: result.actions.map((a, idx) =>
                      idx === i ? { ...a, title } : a
                    ),
                  });
                }}
                color="blue"
              />

              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          {step === "input" ? (
            <>
              <button
                onClick={onClose}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleAnalyze}
                disabled={loading || inputText.trim().length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("analyzing")}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    {t("analyze")}
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setStep("input");
                  setResult(null);
                  setError(null);
                }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("retry")}
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("applying")}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {t("applyToChart")}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({
  icon,
  label,
  items,
  onToggle,
  onEdit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  items: { title: string; enabled: boolean }[];
  onToggle: (index: number) => void;
  onEdit: (index: number, title: string) => void;
  color: string;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const bgColor: Record<string, string> = {
    teal: "bg-teal-50 border-teal-200",
    orange: "bg-orange-50 border-orange-200",
    indigo: "bg-indigo-50 border-indigo-200",
    blue: "bg-blue-50 border-blue-200",
  };

  const borderColor = bgColor[color] || "bg-gray-50 border-gray-200";

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">
          ({items.filter((i) => i.enabled).length}/{items.length})
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              item.enabled ? borderColor : "bg-gray-50 border-gray-100 opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={() => onToggle(i)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            {editingIndex === i ? (
              <input
                type="text"
                value={item.title}
                onChange={(e) => onEdit(i, e.target.value)}
                onBlur={() => setEditingIndex(null)}
                onKeyDown={(e) =>
                  e.key === "Enter" && setEditingIndex(null)
                }
                className="flex-1 text-sm bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                autoFocus
              />
            ) : (
              <span
                className={`flex-1 text-sm ${
                  item.enabled ? "text-gray-900" : "text-gray-400 line-through"
                }`}
              >
                {item.title}
              </span>
            )}
            <button
              onClick={() =>
                setEditingIndex(editingIndex === i ? null : i)
              }
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
