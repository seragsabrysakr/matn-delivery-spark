-- =====================================================================
-- Phase 1a — Dynamic Azure process and board metadata (ADR-013)
--
-- Work item types, their states (with the Azure state category) and each
-- team's boards and board columns are read from Azure DevOps and persisted,
-- so no state name, column name or work item type is hardcoded in the app.
-- Work items additionally carry their Kanban column and lane.
--
-- Rollback:
--   ALTER TABLE public.az_work_items
--     DROP COLUMN board_column, DROP COLUMN board_column_done,
--     DROP COLUMN board_lane, DROP COLUMN board_column_entered_at;
--   DROP TABLE public.az_board_columns, public.az_team_boards,
--     public.az_work_item_type_states, public.az_work_item_types CASCADE;
-- =====================================================================

-- ------------------------------------------------------ work item types
CREATE TABLE IF NOT EXISTS public.az_work_item_types (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  organization_id      uuid NOT NULL,
  project_id           uuid NOT NULL,

  name                 text NOT NULL,
  reference_name       text,
  description          text,
  color                text,
  icon_url             text,
  is_disabled          boolean NOT NULL DEFAULT false,

  source_status        public.source_status NOT NULL DEFAULT 'active',
  is_deleted           boolean NOT NULL DEFAULT false,
  deleted_at_source    timestamptz,
  last_seen_at         timestamptz,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT az_work_item_types_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT az_work_item_types_tenant_project_id_key UNIQUE (tenant_id, project_id, id),
  CONSTRAINT az_work_item_types_natural_key UNIQUE (tenant_id, project_id, name),
  CONSTRAINT az_work_item_types_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.core_projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT az_work_item_types_org_fk FOREIGN KEY (tenant_id, organization_id)
    REFERENCES public.core_organizations (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT az_work_item_types_deleted_consistent
    CHECK (is_deleted = false OR source_status = 'deleted')
);

-- ------------------------------------------------ work item type states
CREATE TABLE IF NOT EXISTS public.az_work_item_type_states (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  project_id           uuid NOT NULL,
  work_item_type_id    uuid NOT NULL,

  state_name           text NOT NULL,
  -- Raw Azure category (Proposed / InProgress / Resolved / Completed / Removed),
  -- kept verbatim so an unexpected value is visible rather than coerced.
  azure_category       text NOT NULL,
  state_category       public.state_category NOT NULL DEFAULT 'unknown',
  color                text,
  sort_order           integer NOT NULL DEFAULT 0,

  source_status        public.source_status NOT NULL DEFAULT 'active',
  is_deleted           boolean NOT NULL DEFAULT false,
  deleted_at_source    timestamptz,
  last_seen_at         timestamptz,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT az_work_item_type_states_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT az_work_item_type_states_natural_key
    UNIQUE (tenant_id, work_item_type_id, state_name),
  CONSTRAINT az_work_item_type_states_type_fk FOREIGN KEY (tenant_id, project_id, work_item_type_id)
    REFERENCES public.az_work_item_types (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT az_work_item_type_states_deleted_consistent
    CHECK (is_deleted = false OR source_status = 'deleted')
);
CREATE INDEX IF NOT EXISTS az_work_item_type_states_project_idx
  ON public.az_work_item_type_states (tenant_id, project_id);

-- ----------------------------------------------------------- team boards
CREATE TABLE IF NOT EXISTS public.az_team_boards (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  organization_id      uuid NOT NULL,
  project_id           uuid NOT NULL,
  team_id              uuid NOT NULL,

  azure_board_id       text NOT NULL,
  name                 text NOT NULL,

  source_status        public.source_status NOT NULL DEFAULT 'active',
  is_deleted           boolean NOT NULL DEFAULT false,
  deleted_at_source    timestamptz,
  last_seen_at         timestamptz,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT az_team_boards_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT az_team_boards_tenant_project_id_key UNIQUE (tenant_id, project_id, id),
  CONSTRAINT az_team_boards_natural_key UNIQUE (tenant_id, team_id, azure_board_id),
  CONSTRAINT az_team_boards_team_fk FOREIGN KEY (tenant_id, project_id, team_id)
    REFERENCES public.core_teams (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT az_team_boards_org_fk FOREIGN KEY (tenant_id, organization_id)
    REFERENCES public.core_organizations (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT az_team_boards_deleted_consistent
    CHECK (is_deleted = false OR source_status = 'deleted')
);

-- --------------------------------------------------------- board columns
CREATE TABLE IF NOT EXISTS public.az_board_columns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  project_id           uuid NOT NULL,
  team_id              uuid NOT NULL,
  board_id             uuid NOT NULL,

  azure_column_id      text NOT NULL,
  name                 text NOT NULL,
  -- Position in Azure's own left-to-right order (0-based).
  column_order         integer NOT NULL,
  column_type          text NOT NULL CHECK (column_type IN ('incoming','inProgress','outgoing','unknown')),
  item_limit           integer,
  is_split             boolean NOT NULL DEFAULT false,
  description          text,
  -- { "<work item type>": "<state>" } exactly as Azure returns it.
  state_mappings       jsonb NOT NULL DEFAULT '{}'::jsonb,

  source_status        public.source_status NOT NULL DEFAULT 'active',
  is_deleted           boolean NOT NULL DEFAULT false,
  deleted_at_source    timestamptz,
  last_seen_at         timestamptz,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT az_board_columns_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT az_board_columns_natural_key UNIQUE (tenant_id, board_id, azure_column_id),
  CONSTRAINT az_board_columns_board_fk FOREIGN KEY (tenant_id, project_id, board_id)
    REFERENCES public.az_team_boards (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT az_board_columns_team_fk FOREIGN KEY (tenant_id, project_id, team_id)
    REFERENCES public.core_teams (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT az_board_columns_state_mappings_object
    CHECK (jsonb_typeof(state_mappings) = 'object'),
  CONSTRAINT az_board_columns_deleted_consistent
    CHECK (is_deleted = false OR source_status = 'deleted')
);
CREATE INDEX IF NOT EXISTS az_board_columns_team_idx
  ON public.az_board_columns (tenant_id, team_id, board_id, column_order);

-- ------------------------------------------- work item board placement
ALTER TABLE public.az_work_items
  ADD COLUMN IF NOT EXISTS board_column            text,
  ADD COLUMN IF NOT EXISTS board_column_done       boolean,
  ADD COLUMN IF NOT EXISTS board_lane              text,
  -- Set by the sync when board_column changes between two syncs; null until
  -- the first observed move (never guessed).
  ADD COLUMN IF NOT EXISTS board_column_entered_at timestamptz;

-- ------------------------------------ triggers, privileges, RLS (forced)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'az_work_item_types','az_work_item_type_states','az_team_boards','az_board_columns'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS immutable_identity ON public.az_work_item_types;
CREATE TRIGGER immutable_identity BEFORE UPDATE ON public.az_work_item_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_column_change(
    'tenant_id','organization_id','project_id','name');

DROP TRIGGER IF EXISTS immutable_identity ON public.az_work_item_type_states;
CREATE TRIGGER immutable_identity BEFORE UPDATE ON public.az_work_item_type_states
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_column_change(
    'tenant_id','project_id','work_item_type_id','state_name');

DROP TRIGGER IF EXISTS immutable_identity ON public.az_team_boards;
CREATE TRIGGER immutable_identity BEFORE UPDATE ON public.az_team_boards
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_column_change(
    'tenant_id','organization_id','project_id','team_id','azure_board_id');

DROP TRIGGER IF EXISTS immutable_identity ON public.az_board_columns;
CREATE TRIGGER immutable_identity BEFORE UPDATE ON public.az_board_columns
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_column_change(
    'tenant_id','project_id','team_id','board_id','azure_column_id');

-- Process metadata is project-wide; boards belong to one team.
DROP POLICY IF EXISTS "scoped project read" ON public.az_work_item_types;
CREATE POLICY "scoped project read" ON public.az_work_item_types
  FOR SELECT TO authenticated USING (public.has_project_access(tenant_id, project_id));

DROP POLICY IF EXISTS "scoped project read" ON public.az_work_item_type_states;
CREATE POLICY "scoped project read" ON public.az_work_item_type_states
  FOR SELECT TO authenticated USING (public.has_project_access(tenant_id, project_id));

DROP POLICY IF EXISTS "scoped team read" ON public.az_team_boards;
CREATE POLICY "scoped team read" ON public.az_team_boards
  FOR SELECT TO authenticated USING (public.has_team_access(tenant_id, team_id));

DROP POLICY IF EXISTS "scoped team read" ON public.az_board_columns;
CREATE POLICY "scoped team read" ON public.az_board_columns
  FOR SELECT TO authenticated USING (public.has_team_access(tenant_id, team_id));
