-- =====================================================================
-- 10 — Delivery schedule (ADR-021), run as service_role inside a
-- transaction that is rolled back (the date-change log is append-only, so
-- its rows can only disappear with the transaction).
-- =====================================================================
BEGIN;
DO $$
DECLARE
  t uuid; t2 uuid; org uuid; org2 uuid; pa uuid; pb uuid; p2 uuid;
  actor uuid; actor2 uuid; d uuid; d_b uuid; r public.dlv_deliverables; n int;
BEGIN
  INSERT INTO public.core_tenants (slug, name_en, name_ar, is_demo)
    VALUES ('test-dlv','Test Dlv','اختبار', true) RETURNING id INTO t;
  INSERT INTO public.core_tenants (slug, name_en, name_ar, is_demo)
    VALUES ('test-dlv-2','Test Dlv 2','اختبار ٢', true) RETURNING id INTO t2;
  INSERT INTO public.core_organizations (tenant_id, azure_organization_name, base_url, name_en, name_ar)
    VALUES (t,'org','https://dev.azure.invalid/o','O','و') RETURNING id INTO org;
  INSERT INTO public.core_organizations (tenant_id, azure_organization_name, base_url, name_en, name_ar)
    VALUES (t2,'org','https://dev.azure.invalid/o','O','و') RETURNING id INTO org2;
  INSERT INTO public.core_projects (tenant_id, organization_id, azure_project_id, azure_project_name, name_en, name_ar)
    VALUES (t, org, 'pa','PA','PA','أ') RETURNING id INTO pa;
  INSERT INTO public.core_projects (tenant_id, organization_id, azure_project_id, azure_project_name, name_en, name_ar)
    VALUES (t, org, 'pb','PB','PB','ب') RETURNING id INTO pb;
  INSERT INTO public.core_projects (tenant_id, organization_id, azure_project_id, azure_project_name, name_en, name_ar)
    VALUES (t2, org2, 'p2','P2','P2','٢') RETURNING id INTO p2;
  INSERT INTO public.core_users (tenant_id, auth_user_id, email, display_name)
    VALUES (t, gen_random_uuid(), 'dm@example.invalid','DM') RETURNING id INTO actor;
  INSERT INTO public.core_users (tenant_id, auth_user_id, email, display_name)
    VALUES (t2, gen_random_uuid(), 'dm2@example.invalid','DM2') RETURNING id INTO actor2;

  INSERT INTO public.dlv_project_mappings (tenant_id, project_id, mode, value, updated_by)
    VALUES (t, pa, 'work_item_type', 'Feature', actor);
  INSERT INTO public.dlv_deliverables (tenant_id, project_id, azure_work_item_id, source_ref, title)
    VALUES (t, pa, 101, 'azure:101', 'Checkout') RETURNING id INTO d;
  INSERT INTO public.dlv_deliverables (tenant_id, project_id, azure_work_item_id, source_ref, title)
    VALUES (t, pb, 201, 'azure:201', 'Reports') RETURNING id INTO d_b;
  RAISE NOTICE 'PASS 10.0 valid rows accepted';

  -- 10.1 unknown mapping mode, one mapping per project
  BEGIN
    INSERT INTO public.dlv_project_mappings (tenant_id, project_id, mode, value)
      VALUES (t, pb, 'guess', 'x');
    RAISE EXCEPTION 'TEST FAILED 10.1a';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 10.1a mapping mode constrained -> 23514';
  END;
  BEGIN
    INSERT INTO public.dlv_project_mappings (tenant_id, project_id, mode, value)
      VALUES (t, pa, 'tag', 'Deliverable');
    RAISE EXCEPTION 'TEST FAILED 10.1b';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS 10.1b one mapping per project -> 23505';
  END;

  -- 10.2 cross-tenant deliverable and cross-project date change
  BEGIN
    INSERT INTO public.dlv_deliverables (tenant_id, project_id, azure_work_item_id, source_ref, title)
      VALUES (t2, pa, 102, 'azure:102', 'X');
    RAISE EXCEPTION 'TEST FAILED 10.2a';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 10.2a cross-tenant deliverable -> 23503';
  END;
  BEGIN
    INSERT INTO public.dlv_date_changes (tenant_id, project_id, deliverable_id, new_date, reason, changed_by)
      VALUES (t, pa, d_b, DATE '2026-11-01', 'wrong project', actor);
    RAISE EXCEPTION 'TEST FAILED 10.2b';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 10.2b cross-project date change -> 23503';
  END;
  BEGIN
    INSERT INTO public.dlv_date_changes (tenant_id, project_id, deliverable_id, new_date, reason, changed_by)
      VALUES (t, pa, d, DATE '2026-11-01', 'foreign actor', actor2);
    RAISE EXCEPTION 'TEST FAILED 10.2c';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 10.2c cross-tenant actor -> 23503';
  END;

  -- 10.3 first confirmation sets committed and baseline, and logs the change
  r := public.dlv_set_committed_date(t, d, DATE '2026-11-15', 'Agreed with the client', actor);
  IF r.committed_date <> DATE '2026-11-15' OR r.baseline_date <> DATE '2026-11-15' THEN
    RAISE EXCEPTION 'TEST FAILED 10.3: % / %', r.committed_date, r.baseline_date;
  END IF;
  SELECT count(*) INTO n FROM public.dlv_date_changes WHERE deliverable_id = d AND old_date IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'TEST FAILED 10.3 log rows %', n; END IF;
  RAISE NOTICE 'PASS 10.3 confirm sets committed + baseline and logs it';

  -- 10.4 a later change moves committed, keeps the baseline, logs old -> new
  r := public.dlv_set_committed_date(t, d, DATE '2026-12-01', 'Scope added by the client', actor);
  IF r.committed_date <> DATE '2026-12-01' OR r.baseline_date <> DATE '2026-11-15' THEN
    RAISE EXCEPTION 'TEST FAILED 10.4: % / %', r.committed_date, r.baseline_date;
  END IF;
  SELECT count(*) INTO n FROM public.dlv_date_changes
    WHERE deliverable_id = d AND old_date = DATE '2026-11-15' AND new_date = DATE '2026-12-01';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST FAILED 10.4 log rows %', n; END IF;
  RAISE NOTICE 'PASS 10.4 change keeps baseline, logs old and new dates';

  -- 10.5 setting the same date again is a no-op (no log row)
  r := public.dlv_set_committed_date(t, d, DATE '2026-12-01', 'same date again', actor);
  SELECT count(*) INTO n FROM public.dlv_date_changes WHERE deliverable_id = d;
  IF n <> 2 THEN RAISE EXCEPTION 'TEST FAILED 10.5 log rows %', n; END IF;
  RAISE NOTICE 'PASS 10.5 unchanged date writes nothing';

  -- 10.6 a reason is required
  BEGIN
    PERFORM public.dlv_set_committed_date(t, d, DATE '2026-12-10', '  ', actor);
    RAISE EXCEPTION 'TEST FAILED 10.6';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 10.6 reason required -> 23514';
  END;

  -- 10.7 the baseline never changes once set
  BEGIN
    UPDATE public.dlv_deliverables SET baseline_date = DATE '2027-01-01' WHERE id = d;
    RAISE EXCEPTION 'TEST FAILED 10.7';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 10.7 baseline set once -> 23514';
  END;

  -- 10.8 the change log is append-only
  BEGIN
    UPDATE public.dlv_date_changes SET reason = 'rewritten' WHERE deliverable_id = d;
    RAISE EXCEPTION 'TEST FAILED 10.8a';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 10.8a change log rejects UPDATE';
  END;
  BEGIN
    DELETE FROM public.dlv_date_changes WHERE deliverable_id = d;
    RAISE EXCEPTION 'TEST FAILED 10.8b';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 10.8b change log rejects DELETE';
  END;

  -- 10.9 another tenant cannot change this deliverable through the function
  BEGIN
    PERFORM public.dlv_set_committed_date(t2, d, DATE '2026-12-20', 'not mine', actor2);
    RAISE EXCEPTION 'TEST FAILED 10.9';
  EXCEPTION WHEN no_data_found THEN RAISE NOTICE 'PASS 10.9 cross-tenant change -> not found';
  END;

  -- 10.10 clients are read-only; only service_role may run the function
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('dlv_project_mappings','dlv_deliverables','dlv_date_changes')
     AND grantee IN ('anon','authenticated') AND privilege_type <> 'SELECT';
  IF n > 0 THEN RAISE EXCEPTION 'TEST FAILED 10.10a: % client write grants', n; END IF;
  IF has_function_privilege('authenticated',
       'public.dlv_set_committed_date(uuid, uuid, date, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.dlv_set_committed_date(uuid, uuid, date, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED 10.10b: clients can run dlv_set_committed_date';
  END IF;
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('dlv_project_mappings','dlv_deliverables','dlv_date_changes')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
  IF n > 0 THEN RAISE EXCEPTION 'TEST FAILED 10.10c: % tables without forced RLS', n; END IF;
  RAISE NOTICE 'PASS 10.10 select-only for clients, forced RLS, function service-only';

  RAISE NOTICE 'SUITE 10 PASSED';
END $$;
ROLLBACK;
