-- =====================================================================
-- Phase 2a — Work item revision history progress (ADR-017)
--
-- Revisions, transitions and scope changes already have append-only tables.
-- This records, per work item, the highest Azure revision whose history has
-- been ingested, so each sync fetches only the missing revisions.
--
-- Rollback:
--   ALTER TABLE public.az_work_items DROP COLUMN IF EXISTS revisions_synced_rev;
-- =====================================================================

ALTER TABLE public.az_work_items
  ADD COLUMN IF NOT EXISTS revisions_synced_rev integer
    CHECK (revisions_synced_rev IS NULL OR revisions_synced_rev >= 0);
