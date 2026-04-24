"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "invalid_link" | "direct_access">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();

      // token_hash + type がクエリにある場合（Supabase のリダイレクト）: verifyOtp でセッション確立
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get("token_hash");
        const type = params.get("type");

        if (tokenHash && type === "recovery") {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (verifyError) {
            logger.error("verifyOtp error:", verifyError);
            setAuthStatus("invalid_link");
            return;
          }
          // 検証成功後、URL からパラメータを削除（クリーンなURLに）
          window.history.replaceState({}, "", "/reset-password");
        }
      }

      // ハッシュがある場合（別のリダイレクト形式）、Supabase クライアントがセッションを確立するまで待つ
      const hasHash = typeof window !== "undefined" && window.location.hash.length > 0;
      if (hasHash) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setAuthStatus("authenticated");
      } else if (hasHash) {
        setAuthStatus("invalid_link");
      } else {
        setAuthStatus("direct_access");
      }
    };

    void checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordMinLength8Error"));
      return;
    }
    if (password !== confirmPassword) {
      setError(tt("passwordMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        logger.error("Password update error:", updateError);
        toast.error(tt("passwordChangeFailed") + ": " + updateError.message, { duration: 5000 });
        setError(updateError.message);
        return;
      }

      toast.success(tt("passwordChanged"), { duration: 3000 });
      router.push("/login");
      router.refresh();
    } catch (err) {
      logger.error("Password update error:", err);
      const message = err instanceof Error ? err.message : tt("passwordChangeFailed");
      toast.error(message, { duration: 5000 });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (authStatus === "checking") {
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
        <p className="text-center text-sm text-muted-foreground">{t("checking")}</p>
      </div>
    );
  }

  if (authStatus === "invalid_link" || authStatus === "direct_access") {
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
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive font-medium">
            {authStatus === "invalid_link"
              ? t("invalidLink")
              : t("directAccess")}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-zenshin-teal hover:text-zenshin-teal/80 hover:underline font-medium"
          >
            {t("requestReset")}
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:underline"
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
        <p className="text-muted-foreground mt-2">{t("newPasswordTitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t("newPassword")}</Label>
          <Input
            id="password"
            type="password"
            placeholder={t("passwordMinLength8")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            className={error ? "border-destructive" : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder={t("confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            className={error ? "border-destructive" : ""}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button
          type="submit"
          className="w-full bg-zenshin-orange hover:bg-zenshin-orange/90 text-white shadow-sm"
          disabled={isLoading}
        >
          {isLoading ? t("changing") : t("changePassword")}
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
