"use client";
import { useState, Suspense } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Chrome } from "lucide-react";
import { logger } from "@/lib/logger";

type OAuthButtonsProps = {
  redirectTo?: string;
};

function OAuthButtonsInner({ redirectTo: propRedirectTo }: OAuthButtonsProps) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const redirectTo = searchParams.get("redirect") || propRedirectTo || "/charts";

    const supabase = createClient();
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          prompt: "select_account",
          hl: locale,
        },
      },
    });
    if (error) {
      logger.error("Google login error:", error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="w-full border-zenshin-navy/25 hover:border-zenshin-navy/50 hover:bg-zenshin-navy/5 text-zenshin-navy"
      onClick={handleGoogleLogin}
      disabled={isLoading}
    >
      <Chrome className="w-5 h-5 mr-2" />
      {isLoading ? t("connecting") : t("googleLogin")}
    </Button>
  );
}

function OAuthButtonsFallback() {
  const t = useTranslations("auth");
  return (
    <Button variant="outline" className="w-full border-zenshin-navy/25 text-zenshin-navy/70" disabled>
      <Chrome className="w-5 h-5 mr-2" />
      {t("loading")}
    </Button>
  );
}

export function OAuthButtons(props: OAuthButtonsProps) {
  return (
    <Suspense fallback={<OAuthButtonsFallback />}>
      <OAuthButtonsInner {...props} />
    </Suspense>
  );
}
