# Release runbook (GitHub → Lovable Cloud)

How a change gets from a pull request to the live app. Lovable is two-way
synced with this repository's `main` branch, and the database is the Lovable
Cloud Postgres (Supabase underneath — hence `supabase-js`,
`supabase/migrations` and `supabase_migrations.schema_migrations`).

> The Lovable project may list the repository as `Sragsakr/matn-delivery-spark`.
> That is this repository under the account's former name; GitHub redirects it.

## 1. Before merging

- CI is green on the PR (lint, typecheck, tests, build).
- If the PR adds a file under `supabase/migrations/`, **apply it to the Lovable
  Cloud database first**. Lovable does not apply migrations that arrive from
  GitHub. Migrations are written to be additive, so the currently deployed code
  keeps working against the new schema.
  - Run the file's SQL in one transaction, then record it:
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('<timestamp>', '<name>', ARRAY['applied from <path> (sha256 <hash>)'])`.
  - Verify: the new tables/columns exist, RLS is enabled **and** forced, and
    `anon` / `authenticated` hold no write grants.

## 2. Merge

Merge the PR into `main` (merge commit; never force-push — see `AGENTS.md`).

## 3. Confirm Lovable picked it up

In Lovable → Settings → GitHub the status must read **up to date** with the new
`main` commit.

If it reads **"Lovable and GitHub have diverged"**, both sides have commits the
other lacks, and Lovable stops syncing `main`. The next push to GitHub `main`
replaces Lovable's copy of the branch with GitHub's, discarding edits made only
in Lovable. Before that push, check the Lovable-only commits (e.g. in the
project's edit history) and carry anything worth keeping into a PR. A common
Lovable-only commit is an automatic `src/integrations/supabase/types.ts`
regeneration after a schema change; the PR that added the migration already
contains the same types, so nothing is lost.

## 4. Publish

Lovable → **Publish / Update**. Merging does not update the live site by itself.

## 5. After publishing

- Open the live app and check the page the change affects.
- For Azure sync changes, run a sprint sync once; process and board metadata
  refresh at the start of a sync when older than 6 hours.
