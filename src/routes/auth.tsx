import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "Sign in to manage the Azure DevOps connection for MATN Delivery Intelligence.",
      },
      { property: "og:title", content: "Sign in — MATN Delivery Intelligence" },
      {
        property: "og:description",
        content: "Sign in to manage the Azure DevOps connection for MATN Delivery Intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    if (mode === "signUp") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      setPending(false);
      if (signUpError) {
        setError(t("auth.signUp.failed"));
        return;
      }
      if (!data.session) {
        setNotice(t("auth.signUp.checkEmail"));
        setMode("signIn");
        return;
      }
      void navigate({ to: "/onboarding" });
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(false);
    if (signInError) {
      setError(t("auth.failed"));
      return;
    }
    if (!data.user?.email_confirmed_at) {
      setNotice(t("auth.unverified"));
      return;
    }
    void navigate({ to: "/onboarding" });
  };

  return (
    <main dir={dir} className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signIn" ? t("auth.title") : t("auth.mode.signUp")}</CardTitle>
          <CardDescription>
            {mode === "signIn" ? t("auth.subtitle") : t("auth.signUp.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "signIn" ? "default" : "outline"}
              onClick={() => {
                setMode("signIn");
                setError(null);
              }}
            >
              {t("auth.mode.signIn")}
            </Button>
            <Button
              type="button"
              variant={mode === "signUp" ? "default" : "outline"}
              onClick={() => {
                setMode("signUp");
                setError(null);
              }}
            >
              {t("auth.mode.signUp")}
            </Button>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                required
                minLength={8}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {notice ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {mode === "signIn"
                ? pending
                  ? t("auth.pending")
                  : t("auth.submit")
                : pending
                  ? t("auth.signUp.pending")
                  : t("auth.signUp.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
