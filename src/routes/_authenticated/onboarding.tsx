import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapFirstTenantAdmin, getBootstrapState } from "@/lib/bootstrap/bootstrap.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Create workspace — MATN Delivery Intelligence" },
      {
        name: "description",
        content:
          "Create the first MATN Delivery Intelligence workspace and become its administrator.",
      },
      { property: "og:title", content: "Create workspace — MATN Delivery Intelligence" },
      {
        property: "og:description",
        content:
          "Create the first MATN Delivery Intelligence workspace and become its administrator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getBootstrapState);
  const bootstrap = useServerFn(bootstrapFirstTenantAdmin);

  const [tenantName, setTenantName] = useState("MATN Delivery Intelligence");
  const [tenantSlug, setTenantSlug] = useState("matn");
  const [error, setError] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["bootstrap-state"],
    queryFn: () => fetchState({ data: undefined }),
  });

  const mutation = useMutation({
    mutationFn: () => bootstrap({ data: { tenantName, tenantSlug } }),
    onSuccess: (result) => {
      if (result.status === "created") {
        void navigate({ to: "/settings/azure" });
        return;
      }
      setError(t(`onboarding.error.${result.reason}`));
      void state.refetch();
    },
    onError: () => setError(t("onboarding.error.unknown")),
  });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  const body = () => {
    if (state.isPending)
      return <p className="text-sm text-muted-foreground">{t("onboarding.checking")}</p>;
    if (state.data && !state.data.emailVerified) {
      return (
        <p role="alert" className="text-sm text-muted-foreground">
          {t("auth.unverified")}
        </p>
      );
    }
    if (state.data?.hasMembership) {
      void navigate({ to: "/settings/azure" });
      return null;
    }
    if (state.data?.hasRealTenant) {
      return (
        <p role="alert" className="text-sm text-muted-foreground">
          {t("onboarding.needsInvite")}
        </p>
      );
    }
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="tenantName">{t("onboarding.name")}</Label>
          <Input
            id="tenantName"
            required
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tenantSlug">{t("onboarding.slug")}</Label>
          <Input
            id="tenantSlug"
            required
            dir="ltr"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("onboarding.slugHint")}</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("onboarding.pending") : t("onboarding.submit")}
        </Button>
      </form>
    );
  };

  return (
    <main dir={dir} className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("onboarding.title")}</CardTitle>
          <CardDescription>{t("onboarding.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {body()}
          <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
            {t("auth.signOut")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
