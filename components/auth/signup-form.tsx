"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export function SignupForm({ redirectTo = "/charts" }: { redirectTo?: string }) {
  const t = useTranslations("auth");
  const tt = useTranslations("toast");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(tt("passwordMismatch"), { duration: 5000 });
      return;
    }

    if (password.length < 6) {
      toast.error(tt("passwordMinLength"), { duration: 5000 });
      return;
    }

    setIsLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      console.error("Signup error:", error);
      toast.error(tt("signupFailed") + ": " + error.message, { duration: 5000 });
      setIsLoading(false);
      return;
    }

    setIsEmailSent(true);
    setIsLoading(false);
  };

  if (isEmailSent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Mail className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">{t("confirmEmailSent")}</h2>
        <p className="text-muted-foreground">
          {t("confirmEmailSentTo", { email })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("confirmEmailInstruction")}
        </p>
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            {t("checkSpamFolder")}
          </p>
        </div>
      </div>
    );
  }

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
          placeholder={t("passwordMinLength")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
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
          required
        />
      </div>
      <Button type="submit" className="w-full bg-zenshin-orange hover:bg-zenshin-orange/90 text-white shadow-sm" disabled={isLoading}>
        {isLoading ? t("creating") : t("signup")}
      </Button>
    </form>
  );
}
