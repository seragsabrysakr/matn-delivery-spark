import { describe, expect, it } from "vitest";
import {
  CRON_HEADERS,
  hmacSha256Hex,
  signingPayload,
  timingSafeEqualHex,
  verifyCronRequest,
} from "../cron-auth";

const SECRET = "s".repeat(48);
const NOW = Date.parse("2026-09-26T12:00:00Z");

async function signedHeaders(
  over: Partial<Record<keyof typeof CRON_HEADERS, string>> = {},
  body = "{}",
  secret = SECRET,
): Promise<Headers> {
  const timestamp = over.timestamp ?? String(Math.floor(NOW / 1000));
  const nonce = over.nonce ?? "nonce-0001";
  const idempotencyKey = over.idempotencyKey ?? "run-42-1-0";
  const signature =
    over.signature ??
    (await hmacSha256Hex(
      secret,
      signingPayload({ timestamp: Number(timestamp), nonce, idempotencyKey }, body),
    ));
  return new Headers({
    [CRON_HEADERS.keyId]: over.keyId ?? "primary",
    [CRON_HEADERS.timestamp]: timestamp,
    [CRON_HEADERS.nonce]: nonce,
    [CRON_HEADERS.idempotencyKey]: idempotencyKey,
    [CRON_HEADERS.signature]: signature,
  });
}

const verify = (headers: Headers, body = "{}", secrets = { primary: SECRET }) =>
  verifyCronRequest({ headers, body, secrets, nowMs: NOW });

describe("hmacSha256Hex", () => {
  it("matches the RFC 4231 test vector", async () => {
    // RFC 4231 test case 2.
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("verifyCronRequest", () => {
  it("accepts a correctly signed, fresh request", async () => {
    const result = await verify(await signedHeaders());
    expect(result.ok).toBe(true);
  });

  it("accepts the rotation key", async () => {
    const next = "n".repeat(40);
    const result = await verifyCronRequest({
      headers: await signedHeaders({ keyId: "next" }, "{}", next),
      body: "{}",
      secrets: { primary: SECRET, next },
      nowMs: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const result = await verify(await signedHeaders(), '{"x":1}');
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a stale timestamp", async () => {
    const old = String(Math.floor(NOW / 1000) - 301);
    const result = await verify(await signedHeaders({ timestamp: old }));
    expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects unknown keys and short or missing secrets", async () => {
    expect(await verify(await signedHeaders({ keyId: "other" }))).toEqual({
      ok: false,
      reason: "unknown_key",
    });
    expect(
      await verifyCronRequest({
        headers: await signedHeaders({}, "{}", "short"),
        body: "{}",
        secrets: { primary: "short" },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("rejects missing or malformed headers", async () => {
    expect(await verify(new Headers())).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verify(await signedHeaders({ nonce: "x" }))).toEqual({
      ok: false,
      reason: "missing_headers",
    });
  });
});

describe("timingSafeEqualHex", () => {
  it("compares equal-length strings", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abc")).toBe(false);
  });
});
