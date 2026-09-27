import { createFileRoute, redirect } from "@tanstack/react-router";

/** Stuck work now lives on the Sprint board page (ADR-029); old links keep working. */
export const Route = createFileRoute("/stuck")({
  beforeLoad: () => {
    throw redirect({ to: "/board", search: { tab: "stuck" } });
  },
});
