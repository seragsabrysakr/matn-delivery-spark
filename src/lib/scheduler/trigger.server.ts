/**
 * Server-only handling of a scheduler trigger (ADR-020): verify the HMAC
 * signature, reject replays and floods, audit accepted and rejected triggers,
 * then run one scheduler step. Secrets come only from server environment.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyCronRequest } from "./cron-auth";
import { runSchedulerTick } from "./tick.server";

const PURPOSE = "scheduler_tick";
const NONCE_TTL_MS = 15 * 60_000;
/** Upper bound on accepted triggers per minute across all callers. */
const MAX_TRIGGERS_PER_MINUTE = 40;
const MAX_BODY_BYTES = 4_096;

export interface SchedulerResponse {
  readonly httpStatus: number;
  readonly body: Record<string, unknown>;
}

async function audit(
  outcome: "success" | "failure" | "denied",
  metadata: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin.from("aud_audit_events").insert({
    tenant_id: null,
    actor_type: "scheduler",
    actor_user_id: null,
    action: "scheduler.tick",
    entity_type: "ops_cron_nonces",
    outcome,
    metadata: metadata as never,
  });
}

const reject = async (httpStatus: number, reason: string): Promise<SchedulerResponse> => {
  await audit("denied", { reason });
  return { httpStatus, body: { status: "rejected", reason } };
};

export async function handleSchedulerRequest(request: Request): Promise<SchedulerResponse> {
  const secrets = {
    primary: process.env["MATN_CRON_SECRET"],
    next: process.env["MATN_CRON_SECRET_NEXT"],
  };
  if (!secrets.primary && !secrets.next) {
    return { httpStatus: 503, body: { status: "rejected", reason: "not_configured" } };
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return reject(413, "body_too_large");

  const nowMs = Date.now();
  const verified = await verifyCronRequest({ headers: request.headers, body, secrets, nowMs });
  if (!verified.ok) return reject(401, verified.reason);

  const since = new Date(nowMs - 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("ops_cron_nonces")
    .select("id", { count: "exact", head: true })
    .eq("purpose", PURPOSE)
    .gte("seen_at", since);
  if ((count ?? 0) >= MAX_TRIGGERS_PER_MINUTE) return reject(429, "rate_limited");

  // The unique nonce and (tenant, idempotency key) constraints reject replays.
  const { error: nonceError } = await supabaseAdmin.from("ops_cron_nonces").insert({
    tenant_id: null,
    nonce: verified.request.nonce,
    idempotency_key: verified.request.idempotencyKey,
    purpose: PURPOSE,
    expires_at: new Date(nowMs + NONCE_TTL_MS).toISOString(),
  });
  if (nonceError) return reject(409, "replayed");

  try {
    const result = await runSchedulerTick(nowMs);
    await audit("success", { keyId: verified.request.keyId, result });
    return { httpStatus: 200, body: result as unknown as Record<string, unknown> };
  } catch {
    await audit("failure", { keyId: verified.request.keyId });
    return { httpStatus: 500, body: { status: "failed" } };
  }
}
