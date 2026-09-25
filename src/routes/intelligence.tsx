import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Delivery Intelligence — MATN" },
      {
        name: "description",
        content:
          "Root-cause explanations, what-if forecasting, and the conversational delivery copilot.",
      },
      { property: "og:title", content: "Delivery Intelligence — MATN" },
      {
        property: "og:description",
        content:
          "Root-cause explanations, what-if forecasting, and the conversational delivery copilot.",
      },
    ],
  }),
  component: IntelligencePage,
});

function IntelligencePage() {
  return (
    <AppShell>
      <PlaceholderPage
        titleKey="intel.title"
        subtitleKey="intel.subtitle"
        bulletKeys={["intel.p1", "intel.p2", "intel.p3"]}
      />
    </AppShell>
  );
}
