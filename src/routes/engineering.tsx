import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";

export const Route = createFileRoute("/engineering")({
  head: () => ({
    meta: [
      { title: "Engineering Health — MATN Delivery Intelligence" },
      {
        name: "description",
        content:
          "Monitor pull request latency, build stability, test health, and deployment status.",
      },
      { property: "og:title", content: "Engineering Health — MATN Delivery Intelligence" },
      {
        property: "og:description",
        content:
          "Monitor pull request latency, build stability, test health, and deployment status.",
      },
    ],
  }),
  component: EngineeringPage,
});

function EngineeringPage() {
  return (
    <AppShell>
      <PlaceholderPage
        titleKey="engPage.title"
        subtitleKey="engPage.subtitle"
        bulletKeys={["engPage.p1", "engPage.p2", "engPage.p3"]}
      />
    </AppShell>
  );
}
