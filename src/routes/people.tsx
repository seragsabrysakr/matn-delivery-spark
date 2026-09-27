import { createFileRoute, redirect } from "@tanstack/react-router";

/** People now live on the Team page (ADR-029); old links keep working. */
export const Route = createFileRoute("/people")({
  beforeLoad: () => {
    throw redirect({ to: "/team" });
  },
});
