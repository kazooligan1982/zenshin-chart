"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type LoginFormProps = {
  redirectTo?: string;
};

export function LoginForm({ redirectTo = "/charts" }: LoginFormProps) {
  const t = useTranslations("auth");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      logger.error("Login error:", error);
      toast.error(tt("loginFailed") + ": " + error.message, { duration: 5000 });
      setIsLoading(false);
      return;
    }
    toast.success(tt("loginSuccess"), { duration: 3000 });
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:underline block"
        >
          {t("forgotPassword")}
        </Link>
      </div>
      <Button type="submit" className="w-full bg-zenshin-orange hover:bg-zenshin-orange/90 text-white shadow-sm" disabled={isLoading}>
        {isLoading ? t("loggingIn") : t("login")}
      </Button>
    </form>
  );
}
