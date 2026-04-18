"use client";

import { useState } from "react";
import { Wand2, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { AiStructurizeModal } from "./AiStructurizeModal";

interface WelcomeCardProps {
  chartId: string;
  onStructurized: (result?: { mode: "applied" | "proposed" }) => void;
}

export function WelcomeCard({ chartId, onStructurized }: WelcomeCardProps) {
  const t = useTranslations("ai");
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [savedInputText, setSavedInputText] = useState("");

  if (dismissed) return null;

  return (
    <>
      <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
              <Wand2 className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                {t("welcomeTitle")}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {t("welcomeDescription")}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                  {t("startWithAi")}
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                >
                  {t("startBlank")}
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showModal && (
        <AiStructurizeModal
          chartId={chartId}
          language={locale}
          initialText={savedInputText}
          onTextChange={setSavedInputText}
          onClose={() => setShowModal(false)}
          onStructurized={(result) => {
            setShowModal(false);
            setDismissed(true);
            onStructurized(result);
          }}
        />
      )}
    </>
  );
}
