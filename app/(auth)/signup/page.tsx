import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "@/components/auth/signup-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const redirectTo = params?.redirect || "/charts";

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
        <p className="text-muted-foreground mt-2">{t("signup")}</p>
      </div>

      <OAuthButtons redirectTo={redirectTo} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-gray-50 px-2 text-muted-foreground">{t("or")}</span>
        </div>
      </div>

      <SignupForm redirectTo={redirectTo} />

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          href={`/login${params?.redirect ? `?redirect=${params.redirect}` : ""}`}
          className="text-zenshin-teal hover:text-zenshin-teal/80 hover:underline font-medium"
        >
          {t("loginLink")}
        </Link>
      </p>
    </div>
  );
}
