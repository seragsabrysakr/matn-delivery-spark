-- =====================================================================
-- Phase 3a — Delivery schedule (ADR-021)
--
-- Delivery dates are not defined in Azure DevOps, and how a deliverable is
-- represented differs per project, so:
--   * dlv_project_mappings says how each project's deliverables are found in
--     Azure (a work item type, a tag, an area path or a saved query);
--   * dlv_deliverables holds one row per deliverable found that way, with the
--     platform-owned dates (committed / baseline) next to the computed
--     progress, forecast and actual date;
--   * dlv_date_changes is the append-only log of every committed-date change,
--     each with a required reason.
-- Azure stays read-only. Committed dates change only through
-- dlv_set_committed_date(), which writes the change log and the new date
-- atomically; the baseline is set once, on the first confirmation, and can
-- never change afterwards.
--
-- Rollback:
--   DROP FUNCTION public.dlv_set_committed_date(uuid, uuid, date, text, uuid);
--   DROP TABLE public.dlv_date_changes, public.dlv_deliverables,
--     public.dlv_project_mappings CASCADE;
--   DROP FUNCTION public.tg_dlv_baseline_once();
-- =====================================================================

-- -------------------------------------------------------- project mappings
CREATE TABLE IF NOT EXISTS public.dlv_project_mappings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  project_id           uuid NOT NULL,

  mode                 text NOT NULL
                       CHECK (mode IN ('work_item_type','tag','area_path','saved_query')),
  value                text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 400),
  is_active            boolean NOT NULL DEFAULT true,
  updated_by           uuid,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dlv_project_mappings_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT dlv_project_mappings_natural_key UNIQUE (tenant_id, project_id),
  CONSTRAINT dlv_project_mappings_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.core_projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT dlv_project_mappings_user_fk FOREIGN KEY (tenant_id, updated_by)
    REFERENCES public.core_users (tenant_id, id)
);

-- ------------------------------------------------------------ deliverables
CREATE TABLE IF NOT EXISTS public.dlv_deliverables (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  project_id            uuid NOT NULL,

  -- The Azure work item that represents the deliverable.
  azure_work_item_id    bigint NOT NULL CHECK (azure_work_item_id > 0),
  work_item_id          uuid,
  source_ref            text NOT NULL,
  title                 text NOT NULL,
  work_item_type        text,
  owner_member_id       uuid,

  -- Computed from Azure on every refresh (never typed in by hand).
  progress_percent      numeric(5,1) CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  progress_basis        text CHECK (progress_basis IS NULL OR progress_basis IN ('points','count')),
  scope_items           integer NOT NULL DEFAULT 0 CHECK (scope_items >= 0),
  completed_items       integer NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
  remaining_points      numeric(10,2),
  contributing_sprints  text[] NOT NULL DEFAULT '{}',
  forecast_date         date,
  forecast_low          date,
  forecast_high         date,
  -- Why there is no forecast, when there is none (e.g. insufficient_history).
  forecast_reason       text,
  actual_date           date,
  computed_at           timestamptz,

  -- Owned by the platform: confirmed through dlv_set_committed_date() only.
  committed_date        date,
  baseline_date         date,
  client_visible        boolean NOT NULL DEFAULT false,
  notes                 text CHECK (notes IS NULL OR length(notes) <= 4000),

  source_status         public.source_status NOT NULL DEFAULT 'active',
  is_deleted            boolean NOT NULL DEFAULT false,
  deleted_at_source     timestamptz,
  last_seen_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dlv_deliverables_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT dlv_deliverables_tenant_project_id_key UNIQUE (tenant_id, project_id, id),
  CONSTRAINT dlv_deliverables_natural_key UNIQUE (tenant_id, project_id, azure_work_item_id),
  CONSTRAINT dlv_deliverables_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.core_projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT dlv_deliverables_work_item_fk FOREIGN KEY (tenant_id, work_item_id)
    REFERENCES public.az_work_items (tenant_id, id) ON DELETE SET NULL (work_item_id),
  CONSTRAINT dlv_deliverables_owner_fk FOREIGN KEY (tenant_id, owner_member_id)
    REFERENCES public.core_members (tenant_id, id) ON DELETE SET NULL (owner_member_id),
  CONSTRAINT dlv_deliverables_forecast_range CHECK (
    forecast_low IS NULL OR forecast_high IS NULL OR forecast_low <= forecast_high),
  CONSTRAINT dlv_deliverables_baseline_needs_commit
    CHECK (baseline_date IS NULL OR committed_date IS NOT NULL),
  CONSTRAINT dlv_deliverables_deleted_consistent
    CHECK (is_deleted = false OR source_status = 'deleted')
);
CREATE INDEX IF NOT EXISTS dlv_deliverables_project_idx
  ON public.dlv_deliverables (tenant_id, project_id) WHERE is_deleted = false;

-- ------------------------------------------------------------ date changes
CREATE TABLE IF NOT EXISTS public.dlv_date_changes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  project_id           uuid NOT NULL,
  deliverable_id       uuid NOT NULL,

  field                text NOT NULL DEFAULT 'committed_date' CHECK (field IN ('committed_date')),
  old_date             date,
  new_date             date NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  changed_by           uuid NOT NULL,
  changed_at           timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dlv_date_changes_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT dlv_date_changes_deliverable_fk FOREIGN KEY (tenant_id, project_id, deliverable_id)
    REFERENCES public.dlv_deliverables (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT dlv_date_changes_user_fk FOREIGN KEY (tenant_id, changed_by)
    REFERENCES public.core_users (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS dlv_date_changes_deliverable_idx
  ON public.dlv_date_changes (tenant_id, deliverable_id, changed_at);

-- -------------------------------------------------- baseline is set once
CREATE OR REPLACE FUNCTION public.tg_dlv_baseline_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.baseline_date IS NOT NULL AND NEW.baseline_date IS DISTINCT FROM OLD.baseline_date THEN
    RAISE EXCEPTION 'baseline_date is set once and never changes' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------- committed date: atomic, audited
-- Called by the server (service role) after it has checked the caller's
-- role. Locks the deliverable, appends the change with its reason, updates
-- the committed date and sets the baseline on the first confirmation.
CREATE OR REPLACE FUNCTION public.dlv_set_committed_date(
  p_tenant_id uuid,
  p_deliverable_id uuid,
  p_new_date date,
  p_reason text,
  p_actor uuid
)
RETURNS public.dlv_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_row public.dlv_deliverables;
  updated_row public.dlv_deliverables;
BEGIN
  IF p_new_date IS NULL THEN
    RAISE EXCEPTION 'new date is required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO current_row FROM public.dlv_deliverables
   WHERE tenant_id = p_tenant_id AND id = p_deliverable_id AND is_deleted = false
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deliverable not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_row.committed_date IS NOT DISTINCT FROM p_new_date THEN
    RETURN current_row;
  END IF;

  INSERT INTO public.dlv_date_changes
    (tenant_id, project_id, deliverable_id, field, old_date, new_date, reason, changed_by)
  VALUES
    (p_tenant_id, current_row.project_id, p_deliverable_id, 'committed_date',
     current_row.committed_date, p_new_date, btrim(p_reason), p_actor);

  UPDATE public.dlv_deliverables
     SET committed_date = p_new_date,
         baseline_date = COALESCE(baseline_date, p_new_date)
   WHERE tenant_id = p_tenant_id AND id = p_deliverable_id
  RETURNING * INTO updated_row;
  RETURN updated_row;
END;
$$;
REVOKE ALL ON FUNCTION public.dlv_set_committed_date(uuid, uuid, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dlv_set_committed_date(uuid, uuid, date, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dlv_set_committed_date(uuid, uuid, date, text, uuid) TO service_role;

-- ------------------------------------ triggers, privileges, RLS (forced)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dlv_project_mappings','dlv_deliverables','dlv_date_changes'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    -- History is append-only: service_role may INSERT and SELECT the change
    -- log; UPDATE/DELETE are withheld and also blocked by the trigger below.
    IF t = 'dlv_date_changes' THEN
      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO service_role', t);
    ELSE
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "scoped project read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "scoped project read" ON public.%I
      FOR SELECT TO authenticated USING (public.has_project_access(tenant_id, project_id))', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS set_updated_at ON public.dlv_project_mappings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dlv_project_mappings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.dlv_deliverables;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dlv_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS immutable_identity ON public.dlv_project_mappings;
CREATE TRIGGER immutable_identity BEFORE UPDATE ON public.dlv_project_mappings
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_column_change('tenant_id','project_id');
DROP TRIGGER IF EXISTS immutable_identity ON public.dlv_deliverables;
CREATE TRIGGER immutable_identity BEFORE UPDATE ON public.dlv_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_column_change(
    'tenant_id','project_id','azure_work_item_id');
DROP TRIGGER IF EXISTS baseline_once ON public.dlv_deliverables;
CREATE TRIGGER baseline_once BEFORE UPDATE ON public.dlv_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_dlv_baseline_once();

DROP TRIGGER IF EXISTS append_only ON public.dlv_date_changes;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON public.dlv_date_changes
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only();
