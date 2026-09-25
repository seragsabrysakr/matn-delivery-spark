#!/usr/bin/env node
/**
 * Phase 3.1 — executable scope-grant concurrency test.
 *
 * Opens two genuinely parallel requests (two separate database sessions,
 * two separate transactions) that call grant_project_scope() for the same
 * tenant + user + project at the same time, and asserts:
 *   1. no unhandled unique violation is raised
 *   2. both calls resolve to the same effective grant id
 *   3. exactly one active grant row exists afterwards
 *
 * The same assertions are repeated for grant_team_scope().
 *
 * Run:  node scripts/concurrency-grant-test.mjs
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 * Fixtures are created with is_demo = true and a reserved `ci-` slug, and
 * are purged through public.purge_ci_tenant() at the end.
 */

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(2);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const insert = (table, row) =>
  rest(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  }).then((r) => r[0]);

const rpc = (fn, args) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

const failures = [];
function check(label, condition, detail = "") {
  if (condition) console.log(`PASS ${label}`);
  else {
    console.error(`FAIL ${label} ${detail}`);
    failures.push(label);
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const tenant = await insert("core_tenants", {
    slug: `ci-conc-${suffix}`,
    name_en: "CI Concurrency",
    name_ar: "اختبار التزامن",
    is_demo: true,
  });

  try {
    const org = await insert("core_organizations", {
      tenant_id: tenant.id,
      azure_organization_name: `ci-org-${suffix}`,
      base_url: "https://dev.azure.invalid/ci",
      name_en: "CI Org",
      name_ar: "منظمة",
    });
    const project = await insert("core_projects", {
      tenant_id: tenant.id,
      organization_id: org.id,
      azure_project_id: `ci-p-${suffix}`,
      azure_project_name: "CI Project",
      name_en: "CI Project",
      name_ar: "مشروع",
    });
    const team = await insert("core_teams", {
      tenant_id: tenant.id,
      organization_id: org.id,
      project_id: project.id,
      azure_team_id: `ci-t-${suffix}`,
      azure_team_name: "CI Team",
      name_en: "CI Team",
      name_ar: "فريق",
    });
    const admin = await insert("core_users", {
      tenant_id: tenant.id,
      auth_user_id: crypto.randomUUID(),
      email: `ci.admin.${suffix}@example.invalid`,
      display_name: "CI Admin",
    });
    const target = await insert("core_users", {
      tenant_id: tenant.id,
      auth_user_id: crypto.randomUUID(),
      email: `ci.target.${suffix}@example.invalid`,
      display_name: "CI Target",
    });
    await insert("core_user_roles", {
      tenant_id: tenant.id,
      user_id: admin.id,
      role: "tenant_admin",
    });

    // ---------------------------------------------------- project scope
    const projectArgs = {
      _tenant_id: tenant.id,
      _user_id: target.id,
      _project_id: project.id,
      _granted_by: admin.id,
      _reason: "concurrency test",
    };
    const [p1, p2] = await Promise.all([
      rpc("grant_project_scope", projectArgs),
      rpc("grant_project_scope", projectArgs),
    ]);
    check("C1 parallel project grants raise no unique violation", true);
    check("C2 parallel project grants resolve to the same grant", p1 === p2, `${p1} vs ${p2}`);
    const activeProject = await rest(
      `core_user_project_scopes?tenant_id=eq.${tenant.id}&user_id=eq.${target.id}` +
        `&project_id=eq.${project.id}&revoked_at=is.null&select=id`,
    );
    check(
      "C3 exactly one active project grant exists",
      activeProject.length === 1,
      `found ${activeProject.length}`,
    );

    // ------------------------------------------------------- team scope
    const teamArgs = {
      _tenant_id: tenant.id,
      _user_id: target.id,
      _team_id: team.id,
      _granted_by: admin.id,
      _reason: "concurrency test",
    };
    const [t1, t2] = await Promise.all([
      rpc("grant_team_scope", teamArgs),
      rpc("grant_team_scope", teamArgs),
    ]);
    check("C4 parallel team grants raise no unique violation", true);
    check("C5 parallel team grants resolve to the same grant", t1 === t2, `${t1} vs ${t2}`);
    const activeTeam = await rest(
      `core_user_team_scopes?tenant_id=eq.${tenant.id}&user_id=eq.${target.id}` +
        `&team_id=eq.${team.id}&revoked_at=is.null&select=id`,
    );
    check(
      "C6 exactly one active team grant exists",
      activeTeam.length === 1,
      `found ${activeTeam.length}`,
    );
  } finally {
    await rpc("purge_ci_tenant", { _tenant_id: tenant.id });
    console.log("fixtures purged");
  }

  if (failures.length) {
    console.error(`SUITE 08 FAILED: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("SUITE 08 PASSED");
}

main().catch((err) => {
  console.error("SUITE 08 ERRORED:", err.message);
  process.exit(1);
});
