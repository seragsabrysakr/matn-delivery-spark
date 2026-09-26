-- =====================================================================
-- Scope from Azure backlog levels (ADR-023)
--
-- Which work item types are sprint scope is read from the project's own
-- Azure process configuration (requirement / task / bug / portfolio
-- backlogs) instead of a hardcoded list, so containers (Epic, Feature) and
-- non-backlog types (Test Case, …) are never counted as scope.
--
-- Rollback:
--   ALTER TABLE public.az_work_item_types DROP COLUMN backlog_level;
-- =====================================================================
ALTER TABLE public.az_work_item_types
  ADD COLUMN IF NOT EXISTS backlog_level text
    CHECK (backlog_level IS NULL OR backlog_level IN ('portfolio','requirement','task','bug'));
