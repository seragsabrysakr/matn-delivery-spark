/**
 * Scheduler trigger (ADR-003, ADR-020). POST only, HMAC-signed. Each request
 * performs at most one bounded sync step; the external scheduler repeats it
 * until the response reports `idle`. Never echoes secrets or Azure errors.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/cron/tick")({
  server: {
    handlers: {
      GET: () => json(405, { status: "rejected", reason: "method_not_allowed" }),
      POST: async ({ request }) => {
        const { handleSchedulerRequest } = await import("@/lib/scheduler/trigger.server");
        const result = await handleSchedulerRequest(request);
        return json(result.httpStatus, result.body);
      },
    },
  },
});
