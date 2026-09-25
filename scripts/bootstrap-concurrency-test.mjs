#!/usr/bin/env node
/**
 * First-admin bootstrap concurrency test.
 *
 * Fires two genuinely parallel calls to bootstrap_first_tenant_admin() from
 * two separate sessions with two different auth user ids, and asserts:
 *   1. exactly one call returns status "created"
 *   2. the other is rejected (never an unhandled error)
 *   3. exactly one non-demo tenant exists afterwards
 *   4. exactly one active tenant_admin role exists in it
 *   5. a third, later attempt is permanently rejected
 *
 * Run:  node scripts/bootstrap-concurrency-test.mjs
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * NOTE: this creates the real first tenant. On a database that already has a
 * real tenant, every attempt must be rejected and the script asserts that
 * instead. Removing a real tenant afterwards is a deliberate service-role SQL
 * operation; the script never deletes real data.
 */
const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(2);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const rpc = async (fn, args) => {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};
const get = async (path) => {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return JSON.parse(text);
};

const attempt = (id, slug) =>
  rpc("bootstrap_first_tenant_admin", {
    p_auth_user_id: id,
    p_email: `${slug}-${id.slice(0, 8)}@example.test`,
    p_display_name: "Concurrency Probe",
    p_tenant_name: "MATN Delivery Intelligence",
    p_tenant_slug: slug,
  });

const assert = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"} — ${message}`);
  if (!ok) process.exitCode = 1;
};

const preExisting = await rpc("real_tenant_exists");
const a = crypto.randomUUID();
const b = crypto.randomUUID();

const [ra, rb] = await Promise.all([attempt(a, "matn"), attempt(b, "matn")]);
const created = [ra, rb].filter((r) => r?.status === "created");
const rejected = [ra, rb].filter((r) => r?.status === "rejected");

if (preExisting) {
  assert(
    created.length === 0 && rejected.length === 2,
    "a real tenant already exists: both parallel attempts rejected",
  );
} else {
  assert(
    created.length === 1,
    `exactly one parallel attempt created a tenant (got ${created.length})`,
  );
  assert(
    rejected.length === 1,
    `the losing attempt was rejected, not errored (got ${JSON.stringify(rejected)})`,
  );
}

const tenants = await get("core_tenants?is_demo=eq.false&select=id,slug");
assert(tenants.length === 1, `exactly one non-demo tenant exists (got ${tenants.length})`);

const admins = await get(
  "core_user_roles?role=eq.tenant_admin&revoked_at=is.null&select=id,tenant_id",
);
assert(admins.length === 1, `exactly one active tenant_admin exists (got ${admins.length})`);

const third = await attempt(crypto.randomUUID(), "matn");
assert(
  third?.status === "rejected",
  `a later attempt is permanently rejected (got ${JSON.stringify(third)})`,
);

console.log(process.exitCode ? "FAILED" : "ALL PASSED");
