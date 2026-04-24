"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const tt = useTranslations("toast");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError(t("emailRequired"));
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(t("emailInvalid"));
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (resetError) {
        logger.error("Password reset error:", resetError);
        toast.error(tt("emailSendFailed") + ": " + resetError.message, { duration: 5000 });
        setError(resetError.message);
        return;
      }

      setIsSent(true);
      toast.success(tt("passwordResetEmailSent"), { duration: 3000 });
    } catch (err) {
      logger.error("Password reset error:", err);
      const message = err instanceof Error ? err.message : tt("emailSendFailed");
      toast.error(message, { duration: 5000 });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
          <div className="flex items-start justify-center gap-1.5">
            <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
            <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
              beta
            </span>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("resetEmailSent")}
            <br />
            {t("resetEmailInstruction")}
          </p>
        </div>
        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-zenshin-teal hover:text-zenshin-teal/80 hover:underline font-medium"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-12 h-12 mx-auto mb-4" />
        <div className="flex items-start justify-center gap-1.5">
          <h1 className="text-2xl font-bold">ZENSHIN CHART</h1>
          <span className="text-[10px] font-light tracking-wider uppercase text-amber-400/70 pt-1">
            beta
          </span>
        </div>
        <p className="text-muted-foreground mt-2">{t("forgotPasswordTitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={error ? "border-destructive" : ""}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button
          type="submit"
          className="w-full bg-zenshin-orange hover:bg-zenshin-orange/90 text-white shadow-sm"
          disabled={isLoading}
        >
          {isLoading ? t("sending") : t("sendResetEmail")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-zenshin-teal hover:text-zenshin-teal/80 hover:underline font-medium">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
