-- ADR-030: alerts and the daily digest (Phase 5).
--
-- ntf_alerts          one row per alert episode (a work item that became stuck,
--                     a deliverable that became late or at risk). Opened by the
--                     scheduler, resolved once — never deleted, never reopened.
-- ntf_detection_runs  append-only log of detection passes (throttling + audit).
-- ntf_digests         one row per tenant per day: the digest that was built and
--                     whether it reached Microsoft Teams. Service-only.
--
-- Clients may only SELECT alerts of projects they can access; every write goes
-- through the service role. Forward-only and additive.

CREATE TABLE IF NOT EXISTS public.ntf_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  project_id           uuid NOT NULL,
  team_iteration_id    uuid,

  kind                 text NOT NULL
                       CHECK (kind IN ('stuck', 'deliverable_late', 'deliverable_at_risk')),
  -- Identifies what the alert is about, e.g. 'stuck:1501' or 'dlv:<uuid>:late'.
  subject_key          text NOT NULL CHECK (length(btrim(subject_key)) BETWEEN 1 AND 200),
  azure_work_item_id   bigint CHECK (azure_work_item_id IS NULL OR azure_work_item_id > 0),
  deliverable_id       uuid,
  title                text NOT NULL CHECK (length(title) <= 1000),
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,

  detected_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ntf_alerts_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT ntf_alerts_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.core_projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ntf_alerts_team_iteration_fk FOREIGN KEY (tenant_id, project_id, team_iteration_id)
    REFERENCES public.core_team_iterations (tenant_id, project_id, id)
    ON DELETE SET NULL (team_iteration_id),
  CONSTRAINT ntf_alerts_deliverable_fk FOREIGN KEY (tenant_id, project_id, deliverable_id)
    REFERENCES public.dlv_deliverables (tenant_id, project_id, id)
    ON DELETE SET NULL (deliverable_id),
  CONSTRAINT ntf_alerts_resolved_after_detected
    CHECK (resolved_at IS NULL OR resolved_at >= detected_at)
);
-- At most one open alert per subject.
CREATE UNIQUE INDEX IF NOT EXISTS ntf_alerts_open_subject_key
  ON public.ntf_alerts (tenant_id, project_id, subject_key) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS ntf_alerts_recent_idx
  ON public.ntf_alerts (tenant_id, detected_at DESC);

-- An alert's identity and detection time never change, and a resolved alert is
-- never reopened: a recurrence is a new episode (a new row).
CREATE OR REPLACE FUNCTION public.tg_ntf_alerts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.subject_key IS DISTINCT FROM OLD.subject_key
     OR NEW.detected_at IS DISTINCT FROM OLD.detected_at THEN
    RAISE EXCEPTION 'alert identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'a resolved alert is never reopened or re-resolved' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ntf_alerts_guard ON public.ntf_alerts;
CREATE TRIGGER ntf_alerts_guard BEFORE UPDATE ON public.ntf_alerts
  FOR EACH ROW EXECUTE FUNCTION public.tg_ntf_alerts_guard();

CREATE TABLE IF NOT EXISTS public.ntf_detection_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  ran_at               timestamptz NOT NULL DEFAULT now(),
  opened               integer NOT NULL DEFAULT 0 CHECK (opened >= 0),
  resolved             integer NOT NULL DEFAULT 0 CHECK (resolved >= 0),
  sprints              integer NOT NULL DEFAULT 0 CHECK (sprints >= 0),
  projects             integer NOT NULL DEFAULT 0 CHECK (projects >= 0),
  failures             text[] NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ntf_detection_runs_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS ntf_detection_runs_recent_idx
  ON public.ntf_detection_runs (tenant_id, ran_at DESC);

CREATE TABLE IF NOT EXISTS public.ntf_digests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  digest_date          date NOT NULL,
  time_zone            text NOT NULL DEFAULT 'Africa/Cairo',
  content              jsonb NOT NULL DEFAULT '{}'::jsonb,
  teams_status         text NOT NULL DEFAULT 'pending'
                       CHECK (teams_status IN ('pending', 'sent', 'failed', 'not_configured')),
  teams_sent_at        timestamptz,
  teams_error          text CHECK (teams_error IS NULL OR length(teams_error) <= 1000),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ntf_digests_tenant_id_key UNIQUE (tenant_id, id),
  -- One digest per tenant per day: the insert is the claim, so it is sent once.
  CONSTRAINT ntf_digests_natural_key UNIQUE (tenant_id, digest_date)
);

-- ------------------------------------ privileges, RLS (forced)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ntf_alerts', 'ntf_detection_runs', 'ntf_digests'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Alerts: readable by users with access to the project; no client writes.
GRANT SELECT ON public.ntf_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ntf_alerts TO service_role;
DROP POLICY IF EXISTS "scoped project read" ON public.ntf_alerts;
CREATE POLICY "scoped project read" ON public.ntf_alerts
  FOR SELECT TO authenticated USING (public.has_project_access(tenant_id, project_id));

-- The detection log is append-only; digests are service-only (the Teams channel
-- copy covers every project of the tenant, so it is never exposed to clients).
GRANT SELECT, INSERT ON public.ntf_detection_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ntf_digests TO service_role;
