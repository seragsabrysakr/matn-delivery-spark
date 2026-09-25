-- =====================================================================
-- 09 — Dynamic process and board metadata (ADR-013), run as service_role.
-- Expected: 23503 for cross-project / cross-tenant references, 23514 for
-- CHECK breaches, and rejected identity changes. Leaves no rows behind.
-- =====================================================================
DO $$
DECLARE
  t uuid; t2 uuid; org uuid; org2 uuid; pa uuid; pb uuid; p2 uuid;
  team_a uuid; team_b uuid; type_a uuid; board_a uuid; n int;
BEGIN
  INSERT INTO public.core_tenants (slug, name_en, name_ar, is_demo)
    VALUES ('test-meta','Test Meta','اختبار', true) RETURNING id INTO t;
  INSERT INTO public.core_tenants (slug, name_en, name_ar, is_demo)
    VALUES ('test-meta-2','Test Meta 2','اختبار ٢', true) RETURNING id INTO t2;
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
  INSERT INTO public.core_teams (tenant_id, organization_id, project_id, azure_team_id, azure_team_name, name_en, name_ar)
    VALUES (t, org, pa, 'ta','TA','TA','ف أ') RETURNING id INTO team_a;
  INSERT INTO public.core_teams (tenant_id, organization_id, project_id, azure_team_id, azure_team_name, name_en, name_ar)
    VALUES (t, org, pb, 'tb','TB','TB','ف ب') RETURNING id INTO team_b;

  INSERT INTO public.az_work_item_types (tenant_id, organization_id, project_id, name)
    VALUES (t, org, pa, 'User Story') RETURNING id INTO type_a;
  INSERT INTO public.az_work_item_type_states
    (tenant_id, project_id, work_item_type_id, state_name, azure_category, state_category)
    VALUES (t, pa, type_a, 'Ready for QA', 'Resolved', 'resolved');
  INSERT INTO public.az_team_boards (tenant_id, organization_id, project_id, team_id, azure_board_id, name)
    VALUES (t, org, pa, team_a, 'b-1', 'Stories') RETURNING id INTO board_a;
  INSERT INTO public.az_board_columns
    (tenant_id, project_id, team_id, board_id, azure_column_id, name, column_order, column_type, state_mappings)
    VALUES (t, pa, team_a, board_a, 'c-1', 'Ready for QA', 0, 'inProgress', '{"User Story":"Ready for QA"}');
  RAISE NOTICE 'PASS 9.0 valid metadata rows accepted';

  -- 9.1 a state of project B pointing at a type of project A
  BEGIN
    INSERT INTO public.az_work_item_type_states
      (tenant_id, project_id, work_item_type_id, state_name, azure_category)
      VALUES (t, pb, type_a, 'New', 'Proposed');
    RAISE EXCEPTION 'TEST FAILED 9.1';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 9.1 cross-project state -> 23503';
  END;

  -- 9.2 a board of project A owned by a team of project B
  BEGIN
    INSERT INTO public.az_team_boards (tenant_id, organization_id, project_id, team_id, azure_board_id, name)
      VALUES (t, org, pa, team_b, 'b-x', 'X');
    RAISE EXCEPTION 'TEST FAILED 9.2';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 9.2 cross-project board -> 23503';
  END;

  -- 9.3 a column of project B on a board of project A
  BEGIN
    INSERT INTO public.az_board_columns
      (tenant_id, project_id, team_id, board_id, azure_column_id, name, column_order, column_type)
      VALUES (t, pb, team_b, board_a, 'c-x', 'X', 0, 'incoming');
    RAISE EXCEPTION 'TEST FAILED 9.3';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 9.3 cross-project column -> 23503';
  END;

  -- 9.4 a type in tenant 2 pointing at a project of tenant 1
  BEGIN
    INSERT INTO public.az_work_item_types (tenant_id, organization_id, project_id, name)
      VALUES (t2, org2, pa, 'Bug');
    RAISE EXCEPTION 'TEST FAILED 9.4';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 9.4 cross-tenant type -> 23503';
  END;

  -- 9.5 invalid column type and non-object state mappings
  BEGIN
    INSERT INTO public.az_board_columns
      (tenant_id, project_id, team_id, board_id, azure_column_id, name, column_order, column_type)
      VALUES (t, pa, team_a, board_a, 'c-2', 'X', 1, 'sideways');
    RAISE EXCEPTION 'TEST FAILED 9.5a';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 9.5a column type constrained -> 23514';
  END;
  BEGIN
    INSERT INTO public.az_board_columns
      (tenant_id, project_id, team_id, board_id, azure_column_id, name, column_order, column_type, state_mappings)
      VALUES (t, pa, team_a, board_a, 'c-3', 'X', 1, 'incoming', '["New"]');
    RAISE EXCEPTION 'TEST FAILED 9.5b';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 9.5b state mappings must be an object -> 23514';
  END;

  -- 9.6 a tombstone must be flagged as deleted at the source
  BEGIN
    UPDATE public.az_team_boards SET is_deleted = true WHERE id = board_a;
    RAISE EXCEPTION 'TEST FAILED 9.6';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 9.6 tombstone consistency -> 23514';
  END;

  -- 9.7 natural identity cannot be rewritten
  BEGIN
    UPDATE public.az_work_item_types SET name = 'Story' WHERE id = type_a;
    RAISE EXCEPTION 'TEST FAILED 9.7';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 9.7 type identity immutable';
  END;

  -- 9.8 one row per state per type
  BEGIN
    INSERT INTO public.az_work_item_type_states
      (tenant_id, project_id, work_item_type_id, state_name, azure_category)
      VALUES (t, pa, type_a, 'Ready for QA', 'Resolved');
    RAISE EXCEPTION 'TEST FAILED 9.8';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS 9.8 state natural key -> 23505';
  END;

  -- 9.9 clients are read-only on the new tables
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('az_work_item_types','az_work_item_type_states','az_team_boards','az_board_columns')
    AND grantee IN ('anon','authenticated')
    AND privilege_type <> 'SELECT';
  IF n > 0 THEN RAISE EXCEPTION 'TEST FAILED 9.9: % client write grants', n; END IF;
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('az_work_item_types','az_work_item_type_states','az_team_boards','az_board_columns')
    AND grantee = 'anon';
  IF n > 0 THEN RAISE EXCEPTION 'TEST FAILED 9.9: anon holds % grants', n; END IF;
  RAISE NOTICE 'PASS 9.9 new tables are select-only for authenticated, closed to anon';

  DELETE FROM public.core_tenants WHERE id IN (t, t2);
  RAISE NOTICE 'SUITE 09 PASSED';
END $$;
