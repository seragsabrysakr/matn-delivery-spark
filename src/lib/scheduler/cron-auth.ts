/**
 * Scheduler request authentication (ADR-003, ADR-020).
 *
 * The trigger is signed with HMAC-SHA256 over
 * `timestamp.nonce.idempotencyKey.body` using a secret identified by a key id,
 * so the secret can be rotated. Requests outside the clock-skew window are
 * rejected; nonce and idempotency replay are rejected by the caller's store.
 * Uses Web Crypto, available in the Worker runtime and in Node.
 */

export const CRON_HEADERS = {
  keyId: "x-matn-key-id",
  timestamp: "x-matn-timestamp",
  nonce: "x-matn-nonce",
  idempotencyKey: "x-matn-idempotency-key",
  signature: "x-matn-signature",
} as const;

export const CRON_MAX_SKEW_SECONDS = 300;

export interface CronRequestHeaders {
  readonly keyId: string;
  readonly timestamp: number;
  readonly nonce: string;
  readonly idempotencyKey: string;
  readonly signature: string;
}

export type CronRejection = "missing_headers" | "unknown_key" | "stale_timestamp" | "bad_signature";

const TOKEN = /^[A-Za-z0-9._:-]{8,128}$/;

export function readCronHeaders(headers: Headers): CronRequestHeaders | null {
  const keyId = headers.get(CRON_HEADERS.keyId)?.trim() ?? "";
  const timestamp = Number(headers.get(CRON_HEADERS.timestamp));
  const nonce = headers.get(CRON_HEADERS.nonce)?.trim() ?? "";
  const idempotencyKey = headers.get(CRON_HEADERS.idempotencyKey)?.trim() ?? "";
  const signature = headers.get(CRON_HEADERS.signature)?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9_-]{1,32}$/.test(keyId)) return null;
  if (!Number.isInteger(timestamp) || timestamp <= 0) return null;
  if (!TOKEN.test(nonce) || !TOKEN.test(idempotencyKey)) return null;
  if (!/^[0-9a-f]{64}$/.test(signature)) return null;
  return { keyId, timestamp, nonce, idempotencyKey, signature };
}

export const signingPayload = (h: Omit<CronRequestHeaders, "keyId" | "signature">, body: string) =>
  `${h.timestamp}.${h.nonce}.${h.idempotencyKey}.${body}`;

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two equal-length hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies headers, key, clock skew and signature. `secrets` maps key id to
 * secret; empty or missing secrets are never accepted.
 */
export async function verifyCronRequest(input: {
  readonly headers: Headers;
  readonly body: string;
  readonly secrets: Readonly<Record<string, string | undefined>>;
  readonly nowMs: number;
  readonly maxSkewSeconds?: number;
}): Promise<{ ok: true; request: CronRequestHeaders } | { ok: false; reason: CronRejection }> {
  const request = readCronHeaders(input.headers);
  if (!request) return { ok: false, reason: "missing_headers" };
  const secret = input.secrets[request.keyId];
  if (!secret || secret.length < 32) return { ok: false, reason: "unknown_key" };
  const skew = Math.abs(input.nowMs / 1000 - request.timestamp);
  if (skew > (input.maxSkewSeconds ?? CRON_MAX_SKEW_SECONDS))
    return { ok: false, reason: "stale_timestamp" };
  const expected = await hmacSha256Hex(secret, signingPayload(request, input.body));
  if (!timingSafeEqualHex(expected, request.signature))
    return { ok: false, reason: "bad_signature" };
  return { ok: true, request };
}
