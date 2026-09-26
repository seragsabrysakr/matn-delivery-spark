export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      an_daily_iteration_snapshots: {
        Row: {
          added_estimate: number | null
          blocked_count: number | null
          committed_estimate: number | null
          completed_estimate: number | null
          created_at: string
          finalized_at: string | null
          id: string
          item_counts: Json
          iteration_id: string
          metrics: Json
          project_id: string
          remaining_estimate: number | null
          removed_estimate: number | null
          snapshot_date: string
          team_id: string
          team_iteration_id: string
          tenant_id: string
          time_zone: string
          total_working_days: number | null
          updated_at: string
          working_day_index: number | null
        }
        Insert: {
          added_estimate?: number | null
          blocked_count?: number | null
          committed_estimate?: number | null
          completed_estimate?: number | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          item_counts?: Json
          iteration_id: string
          metrics?: Json
          project_id: string
          remaining_estimate?: number | null
          removed_estimate?: number | null
          snapshot_date: string
          team_id: string
          team_iteration_id: string
          tenant_id: string
          time_zone?: string
          total_working_days?: number | null
          updated_at?: string
          working_day_index?: number | null
        }
        Update: {
          added_estimate?: number | null
          blocked_count?: number | null
          committed_estimate?: number | null
          completed_estimate?: number | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          item_counts?: Json
          iteration_id?: string
          metrics?: Json
          project_id?: string
          remaining_estimate?: number | null
          removed_estimate?: number | null
          snapshot_date?: string
          team_id?: string
          team_iteration_id?: string
          tenant_id?: string
          time_zone?: string
          total_working_days?: number | null
          updated_at?: string
          working_day_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "an_daily_iteration_snapshots_iteration_fk"
            columns: ["tenant_id", "project_id", "iteration_id"]
            isOneToOne: false
            referencedRelation: "core_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "an_daily_iteration_snapshots_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "an_daily_iteration_snapshots_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      an_daily_member_snapshots: {
        Row: {
          assigned_estimate: number | null
          capacity_hours: number | null
          completed_estimate: number | null
          created_at: string
          finalized_at: string | null
          id: string
          member_id: string
          metrics: Json
          project_id: string
          snapshot_date: string
          team_id: string
          team_iteration_id: string | null
          tenant_id: string
          time_zone: string
          updated_at: string
          utilization: number | null
        }
        Insert: {
          assigned_estimate?: number | null
          capacity_hours?: number | null
          completed_estimate?: number | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          member_id: string
          metrics?: Json
          project_id: string
          snapshot_date: string
          team_id: string
          team_iteration_id?: string | null
          tenant_id: string
          time_zone?: string
          updated_at?: string
          utilization?: number | null
        }
        Update: {
          assigned_estimate?: number | null
          capacity_hours?: number | null
          completed_estimate?: number | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          member_id?: string
          metrics?: Json
          project_id?: string
          snapshot_date?: string
          team_id?: string
          team_iteration_id?: string | null
          tenant_id?: string
          time_zone?: string
          updated_at?: string
          utilization?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "an_daily_member_snapshots_member_fk"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "an_daily_member_snapshots_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "an_daily_member_snapshots_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      an_daily_project_snapshots: {
        Row: {
          created_at: string
          finalized_at: string | null
          id: string
          metrics: Json
          project_id: string
          snapshot_date: string
          tenant_id: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          metrics?: Json
          project_id: string
          snapshot_date: string
          tenant_id: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          metrics?: Json
          project_id?: string
          snapshot_date?: string
          tenant_id?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "an_daily_project_snapshots_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      an_daily_team_snapshots: {
        Row: {
          created_at: string
          finalized_at: string | null
          id: string
          metrics: Json
          project_id: string
          snapshot_date: string
          team_id: string
          team_iteration_id: string | null
          tenant_id: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          metrics?: Json
          project_id: string
          snapshot_date: string
          team_id: string
          team_iteration_id?: string | null
          tenant_id: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          metrics?: Json
          project_id?: string
          snapshot_date?: string
          team_id?: string
          team_iteration_id?: string | null
          tenant_id?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "an_daily_team_snapshots_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "an_daily_team_snapshots_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      an_kpi_configuration_overrides: {
        Row: {
          configuration: Json
          configuration_version: number
          created_at: string
          created_by_user_id: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_enabled: boolean
          kpi_definition_id: string
          kpi_id: string
          project_id: string | null
          team_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          configuration_version?: number
          created_at?: string
          created_by_user_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_enabled?: boolean
          kpi_definition_id: string
          kpi_id: string
          project_id?: string | null
          team_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          configuration_version?: number
          created_at?: string
          created_by_user_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_enabled?: boolean
          kpi_definition_id?: string
          kpi_id?: string
          project_id?: string | null
          team_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "an_kpi_configuration_overrides_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "an_kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "an_kpi_configuration_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "an_kpi_overrides_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "an_kpi_overrides_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      an_kpi_definitions: {
        Row: {
          calculation_version: number
          category: string
          created_at: string
          default_configuration: Json
          description_ar: string | null
          description_en: string | null
          direction: Database["public"]["Enums"]["kpi_direction"]
          formula: string
          id: string
          inputs: Json
          is_active: boolean
          kpi_id: string
          name_ar: string
          name_en: string
          supported_scopes: Database["public"]["Enums"]["kpi_scope_level"][]
          unit: string
        }
        Insert: {
          calculation_version?: number
          category: string
          created_at?: string
          default_configuration?: Json
          description_ar?: string | null
          description_en?: string | null
          direction?: Database["public"]["Enums"]["kpi_direction"]
          formula: string
          id?: string
          inputs?: Json
          is_active?: boolean
          kpi_id: string
          name_ar: string
          name_en: string
          supported_scopes?: Database["public"]["Enums"]["kpi_scope_level"][]
          unit: string
        }
        Update: {
          calculation_version?: number
          category?: string
          created_at?: string
          default_configuration?: Json
          description_ar?: string | null
          description_en?: string | null
          direction?: Database["public"]["Enums"]["kpi_direction"]
          formula?: string
          id?: string
          inputs?: Json
          is_active?: boolean
          kpi_id?: string
          name_ar?: string
          name_en?: string
          supported_scopes?: Database["public"]["Enums"]["kpi_scope_level"][]
          unit?: string
        }
        Relationships: []
      }
      an_kpi_values: {
        Row: {
          calculated_at: string
          calculation_version: number
          configuration_version: number
          created_at: string
          denominator: number | null
          health: Database["public"]["Enums"]["health_status"]
          id: string
          kpi_definition_id: string
          kpi_id: string
          member_id: string | null
          numerator: number | null
          project_id: string | null
          resolved_configuration: Json
          sample_size: number | null
          scope_hash: string | null
          scope_level: Database["public"]["Enums"]["kpi_scope_level"]
          team_id: string | null
          team_iteration_id: string | null
          tenant_id: string
          valid_from: string
          valid_to: string | null
          value: number | null
        }
        Insert: {
          calculated_at?: string
          calculation_version?: number
          configuration_version?: number
          created_at?: string
          denominator?: number | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          kpi_definition_id: string
          kpi_id: string
          member_id?: string | null
          numerator?: number | null
          project_id?: string | null
          resolved_configuration?: Json
          sample_size?: number | null
          scope_hash?: string | null
          scope_level?: Database["public"]["Enums"]["kpi_scope_level"]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id: string
          valid_from: string
          valid_to?: string | null
          value?: number | null
        }
        Update: {
          calculated_at?: string
          calculation_version?: number
          configuration_version?: number
          created_at?: string
          denominator?: number | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          kpi_definition_id?: string
          kpi_id?: string
          member_id?: string | null
          numerator?: number | null
          project_id?: string | null
          resolved_configuration?: Json
          sample_size?: number | null
          scope_hash?: string | null
          scope_level?: Database["public"]["Enums"]["kpi_scope_level"]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id?: string
          valid_from?: string
          valid_to?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "an_kpi_values_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "an_kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "an_kpi_values_member_fk"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "an_kpi_values_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "an_kpi_values_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "an_kpi_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "an_kpi_values_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      aud_audit_events: {
        Row: {
          action: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          actor_user_id: string | null
          correlation_id: string
          entity_id: string | null
          entity_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          occurred_at: string
          outcome: Database["public"]["Enums"]["audit_outcome"]
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          correlation_id?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          outcome?: Database["public"]["Enums"]["audit_outcome"]
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          correlation_id?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          outcome?: Database["public"]["Enums"]["audit_outcome"]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aud_audit_events_actor_fk"
            columns: ["tenant_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "aud_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      az_board_columns: {
        Row: {
          azure_column_id: string
          board_id: string
          column_order: number
          column_type: string
          created_at: string
          deleted_at_source: string | null
          description: string | null
          id: string
          is_deleted: boolean
          is_split: boolean
          item_limit: number | null
          last_seen_at: string | null
          last_synced_at: string | null
          name: string
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          state_mappings: Json
          team_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          azure_column_id: string
          board_id: string
          column_order: number
          column_type: string
          created_at?: string
          deleted_at_source?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          is_split?: boolean
          item_limit?: number | null
          last_seen_at?: string | null
          last_synced_at?: string | null
          name: string
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          state_mappings?: Json
          team_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          azure_column_id?: string
          board_id?: string
          column_order?: number
          column_type?: string
          created_at?: string
          deleted_at_source?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          is_split?: boolean
          item_limit?: number | null
          last_seen_at?: string | null
          last_synced_at?: string | null
          name?: string
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          state_mappings?: Json
          team_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_board_columns_board_fk"
            columns: ["tenant_id", "project_id", "board_id"]
            isOneToOne: false
            referencedRelation: "az_team_boards"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_board_columns_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_builds: {
        Row: {
          access_revoked_at: string | null
          azure_build_id: number
          branch: string | null
          build_number: string | null
          created_at: string
          deleted_at_source: string | null
          duration_seconds: number | null
          finished_at: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          pipeline_id: string
          project_id: string
          queued_at: string | null
          requested_by_member_id: string | null
          result: Database["public"]["Enums"]["run_result"]
          source_status: Database["public"]["Enums"]["source_status"]
          started_at: string | null
          status: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_build_id: number
          branch?: string | null
          build_number?: string | null
          created_at?: string
          deleted_at_source?: string | null
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          pipeline_id: string
          project_id: string
          queued_at?: string | null
          requested_by_member_id?: string | null
          result?: Database["public"]["Enums"]["run_result"]
          source_status?: Database["public"]["Enums"]["source_status"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_build_id?: number
          branch?: string | null
          build_number?: string | null
          created_at?: string
          deleted_at_source?: string | null
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          pipeline_id?: string
          project_id?: string
          queued_at?: string | null
          requested_by_member_id?: string | null
          result?: Database["public"]["Enums"]["run_result"]
          source_status?: Database["public"]["Enums"]["source_status"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_state"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_builds_pipeline_fk"
            columns: ["tenant_id", "project_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "az_pipelines"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_deployments: {
        Row: {
          access_revoked_at: string | null
          attempt: number
          azure_deployment_id: number
          build_id: string | null
          created_at: string
          deleted_at_source: string | null
          duration_seconds: number | null
          environment_id: string
          finished_at: string | null
          id: string
          is_deleted: boolean
          is_rollback: boolean
          last_seen_at: string | null
          project_id: string
          requested_by_member_id: string | null
          result: Database["public"]["Enums"]["run_result"]
          source_status: Database["public"]["Enums"]["source_status"]
          started_at: string | null
          status: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          attempt?: number
          azure_deployment_id: number
          build_id?: string | null
          created_at?: string
          deleted_at_source?: string | null
          duration_seconds?: number | null
          environment_id: string
          finished_at?: string | null
          id?: string
          is_deleted?: boolean
          is_rollback?: boolean
          last_seen_at?: string | null
          project_id: string
          requested_by_member_id?: string | null
          result?: Database["public"]["Enums"]["run_result"]
          source_status?: Database["public"]["Enums"]["source_status"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          attempt?: number
          azure_deployment_id?: number
          build_id?: string | null
          created_at?: string
          deleted_at_source?: string | null
          duration_seconds?: number | null
          environment_id?: string
          finished_at?: string | null
          id?: string
          is_deleted?: boolean
          is_rollback?: boolean
          last_seen_at?: string | null
          project_id?: string
          requested_by_member_id?: string | null
          result?: Database["public"]["Enums"]["run_result"]
          source_status?: Database["public"]["Enums"]["source_status"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_state"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_deployments_build_fk"
            columns: ["tenant_id", "project_id", "build_id"]
            isOneToOne: false
            referencedRelation: "az_builds"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_deployments_env_fk"
            columns: ["tenant_id", "project_id", "environment_id"]
            isOneToOne: false
            referencedRelation: "az_environments"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_environments: {
        Row: {
          access_revoked_at: string | null
          created_at: string
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          is_production: boolean
          last_seen_at: string | null
          name: string
          project_id: string
          rank: number
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          is_production?: boolean
          last_seen_at?: string | null
          name: string
          project_id: string
          rank?: number
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          is_production?: boolean
          last_seen_at?: string | null
          name?: string
          project_id?: string
          rank?: number
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_environments_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_pipelines: {
        Row: {
          access_revoked_at: string | null
          azure_pipeline_id: number
          created_at: string
          deleted_at_source: string | null
          folder: string | null
          id: string
          is_deleted: boolean
          is_disabled: boolean
          last_seen_at: string | null
          name: string
          pipeline_type: string
          project_id: string
          repository_id: string | null
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_pipeline_id: number
          created_at?: string
          deleted_at_source?: string | null
          folder?: string | null
          id?: string
          is_deleted?: boolean
          is_disabled?: boolean
          last_seen_at?: string | null
          name: string
          pipeline_type?: string
          project_id: string
          repository_id?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_pipeline_id?: number
          created_at?: string
          deleted_at_source?: string | null
          folder?: string | null
          id?: string
          is_deleted?: boolean
          is_disabled?: boolean
          last_seen_at?: string | null
          name?: string
          pipeline_type?: string
          project_id?: string
          repository_id?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_pipelines_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_pipelines_repo_fk"
            columns: ["tenant_id", "project_id", "repository_id"]
            isOneToOne: false
            referencedRelation: "az_repositories"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_pull_request_reviews: {
        Row: {
          access_revoked_at: string | null
          created_at: string
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          is_required: boolean
          last_seen_at: string | null
          pull_request_id: string
          reviewer_member_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
          vote: Database["public"]["Enums"]["review_vote"]
          voted_at: string | null
        }
        Insert: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          is_required?: boolean
          last_seen_at?: string | null
          pull_request_id: string
          reviewer_member_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
          vote?: Database["public"]["Enums"]["review_vote"]
          voted_at?: string | null
        }
        Update: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          is_required?: boolean
          last_seen_at?: string | null
          pull_request_id?: string
          reviewer_member_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
          vote?: Database["public"]["Enums"]["review_vote"]
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "az_pr_reviews_member_fk"
            columns: ["tenant_id", "reviewer_member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_pr_reviews_pr_fk"
            columns: ["tenant_id", "pull_request_id"]
            isOneToOne: false
            referencedRelation: "az_pull_requests"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_pull_requests: {
        Row: {
          access_revoked_at: string | null
          added_lines: number | null
          approved_at: string | null
          azure_pull_request_id: number
          closed_at: string | null
          comment_count: number
          created_at: string
          created_at_source: string
          created_by_member_id: string | null
          deleted_at_source: string | null
          deleted_lines: number | null
          first_review_at: string | null
          id: string
          is_deleted: boolean
          is_draft: boolean
          last_activity_at: string | null
          last_seen_at: string | null
          merged_at: string | null
          organization_id: string
          project_id: string
          repository_id: string
          reviewer_count: number
          source_branch: string | null
          source_status: Database["public"]["Enums"]["source_status"]
          status: Database["public"]["Enums"]["pull_request_status"]
          target_branch: string | null
          team_id: string | null
          tenant_id: string
          time_to_first_review_seconds: number | null
          time_to_merge_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          added_lines?: number | null
          approved_at?: string | null
          azure_pull_request_id: number
          closed_at?: string | null
          comment_count?: number
          created_at?: string
          created_at_source: string
          created_by_member_id?: string | null
          deleted_at_source?: string | null
          deleted_lines?: number | null
          first_review_at?: string | null
          id?: string
          is_deleted?: boolean
          is_draft?: boolean
          last_activity_at?: string | null
          last_seen_at?: string | null
          merged_at?: string | null
          organization_id: string
          project_id: string
          repository_id: string
          reviewer_count?: number
          source_branch?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          status?: Database["public"]["Enums"]["pull_request_status"]
          target_branch?: string | null
          team_id?: string | null
          tenant_id: string
          time_to_first_review_seconds?: number | null
          time_to_merge_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          added_lines?: number | null
          approved_at?: string | null
          azure_pull_request_id?: number
          closed_at?: string | null
          comment_count?: number
          created_at?: string
          created_at_source?: string
          created_by_member_id?: string | null
          deleted_at_source?: string | null
          deleted_lines?: number | null
          first_review_at?: string | null
          id?: string
          is_deleted?: boolean
          is_draft?: boolean
          last_activity_at?: string | null
          last_seen_at?: string | null
          merged_at?: string | null
          organization_id?: string
          project_id?: string
          repository_id?: string
          reviewer_count?: number
          source_branch?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          status?: Database["public"]["Enums"]["pull_request_status"]
          target_branch?: string | null
          team_id?: string | null
          tenant_id?: string
          time_to_first_review_seconds?: number | null
          time_to_merge_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_pull_requests_author_fk"
            columns: ["tenant_id", "created_by_member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_pull_requests_repo_fk"
            columns: ["tenant_id", "project_id", "repository_id"]
            isOneToOne: false
            referencedRelation: "az_repositories"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_pull_requests_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_raw_payloads: {
        Row: {
          azure_id: string
          created_at: string
          entity_kind: string
          fetched_at: string
          id: string
          payload: Json
          rev: number
          tenant_id: string
        }
        Insert: {
          azure_id: string
          created_at?: string
          entity_kind: string
          fetched_at?: string
          id?: string
          payload: Json
          rev?: number
          tenant_id: string
        }
        Update: {
          azure_id?: string
          created_at?: string
          entity_kind?: string
          fetched_at?: string
          id?: string
          payload?: Json
          rev?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_raw_payloads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      az_repositories: {
        Row: {
          access_revoked_at: string | null
          azure_repository_id: string
          created_at: string
          default_branch: string | null
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          is_disabled: boolean
          last_seen_at: string | null
          name: string
          organization_id: string
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
          web_url: string | null
        }
        Insert: {
          access_revoked_at?: string | null
          azure_repository_id: string
          created_at?: string
          default_branch?: string | null
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          is_disabled?: boolean
          last_seen_at?: string | null
          name: string
          organization_id: string
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
          web_url?: string | null
        }
        Update: {
          access_revoked_at?: string | null
          azure_repository_id?: string
          created_at?: string
          default_branch?: string | null
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          is_disabled?: boolean
          last_seen_at?: string | null
          name?: string
          organization_id?: string
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
          web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "az_repositories_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_team_boards: {
        Row: {
          azure_board_id: string
          created_at: string
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          name: string
          organization_id: string
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          team_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          azure_board_id: string
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name: string
          organization_id: string
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          team_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          azure_board_id?: string
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          team_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_team_boards_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_team_boards_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_test_result_summaries: {
        Row: {
          calculated_at: string
          created_at: string
          duration_seconds: number | null
          failed_count: number
          flaky_count: number
          id: string
          pass_rate: number | null
          passed_count: number
          skipped_count: number
          tenant_id: string
          test_run_id: string
          total_count: number
          updated_at: string
        }
        Insert: {
          calculated_at?: string
          created_at?: string
          duration_seconds?: number | null
          failed_count?: number
          flaky_count?: number
          id?: string
          pass_rate?: number | null
          passed_count?: number
          skipped_count?: number
          tenant_id: string
          test_run_id: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          created_at?: string
          duration_seconds?: number | null
          failed_count?: number
          flaky_count?: number
          id?: string
          pass_rate?: number | null
          passed_count?: number
          skipped_count?: number
          tenant_id?: string
          test_run_id?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_test_result_summaries_run_fk"
            columns: ["tenant_id", "test_run_id"]
            isOneToOne: true
            referencedRelation: "az_test_runs"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_test_runs: {
        Row: {
          access_revoked_at: string | null
          azure_test_run_id: number
          build_id: string | null
          completed_at: string | null
          created_at: string
          deleted_at_source: string | null
          deployment_id: string | null
          id: string
          is_automated: boolean
          is_deleted: boolean
          last_seen_at: string | null
          name: string | null
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          started_at: string | null
          state: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_test_run_id: number
          build_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          deployment_id?: string | null
          id?: string
          is_automated?: boolean
          is_deleted?: boolean
          last_seen_at?: string | null
          name?: string | null
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_test_run_id?: number
          build_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          deployment_id?: string | null
          id?: string
          is_automated?: boolean
          is_deleted?: boolean
          last_seen_at?: string | null
          name?: string | null
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_test_runs_build_fk"
            columns: ["tenant_id", "project_id", "build_id"]
            isOneToOne: false
            referencedRelation: "az_builds"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_test_runs_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_work_item_relations: {
        Row: {
          access_revoked_at: string | null
          azure_relation_name: string
          created_at: string
          deleted_at_source: string | null
          id: string
          is_cross_project: boolean
          is_deleted: boolean
          last_seen_at: string | null
          relation_type: string
          source_status: Database["public"]["Enums"]["source_status"]
          source_work_item_id: string
          target_azure_work_item_id: number
          target_work_item_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_relation_name: string
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_cross_project?: boolean
          is_deleted?: boolean
          last_seen_at?: string | null
          relation_type: string
          source_status?: Database["public"]["Enums"]["source_status"]
          source_work_item_id: string
          target_azure_work_item_id: number
          target_work_item_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_relation_name?: string
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_cross_project?: boolean
          is_deleted?: boolean
          last_seen_at?: string | null
          relation_type?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          source_work_item_id?: string
          target_azure_work_item_id?: number
          target_work_item_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_item_relations_source_fk"
            columns: ["tenant_id", "source_work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_item_relations_target_fk"
            columns: ["tenant_id", "target_work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_work_item_revisions: {
        Row: {
          area_path: string | null
          assigned_to_member_id: string | null
          azure_work_item_id: number
          completed_work: number | null
          created_at: string
          estimate: number | null
          fields: Json
          id: string
          is_blocked: boolean | null
          iteration_path: string | null
          project_id: string
          remaining_work: number | null
          rev: number
          revised_at: string
          revised_by_member_id: string | null
          state: string | null
          state_category: Database["public"]["Enums"]["state_category"]
          tenant_id: string
          work_item_id: string
        }
        Insert: {
          area_path?: string | null
          assigned_to_member_id?: string | null
          azure_work_item_id: number
          completed_work?: number | null
          created_at?: string
          estimate?: number | null
          fields?: Json
          id?: string
          is_blocked?: boolean | null
          iteration_path?: string | null
          project_id: string
          remaining_work?: number | null
          rev: number
          revised_at: string
          revised_by_member_id?: string | null
          state?: string | null
          state_category?: Database["public"]["Enums"]["state_category"]
          tenant_id: string
          work_item_id: string
        }
        Update: {
          area_path?: string | null
          assigned_to_member_id?: string | null
          azure_work_item_id?: number
          completed_work?: number | null
          created_at?: string
          estimate?: number | null
          fields?: Json
          id?: string
          is_blocked?: boolean | null
          iteration_path?: string | null
          project_id?: string
          remaining_work?: number | null
          rev?: number
          revised_at?: string
          revised_by_member_id?: string | null
          state?: string | null
          state_category?: Database["public"]["Enums"]["state_category"]
          tenant_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_item_revisions_item_fk"
            columns: ["tenant_id", "work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_item_revisions_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_work_item_scope_changes: {
        Row: {
          change_type: string
          created_at: string
          estimate_delta: number | null
          id: string
          iteration_id: string
          occurred_at: string
          project_id: string
          source_rev: number | null
          team_iteration_id: string | null
          tenant_id: string
          work_item_id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          estimate_delta?: number | null
          id?: string
          iteration_id: string
          occurred_at: string
          project_id: string
          source_rev?: number | null
          team_iteration_id?: string | null
          tenant_id: string
          work_item_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          estimate_delta?: number | null
          id?: string
          iteration_id?: string
          occurred_at?: string
          project_id?: string
          source_rev?: number | null
          team_iteration_id?: string | null
          tenant_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_item_scope_changes_item_fk"
            columns: ["tenant_id", "work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_item_scope_changes_iteration_fk"
            columns: ["tenant_id", "project_id", "iteration_id"]
            isOneToOne: false
            referencedRelation: "core_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_work_item_scope_changes_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_work_item_transitions: {
        Row: {
          changed_by_member_id: string | null
          created_at: string
          duration_seconds: number | null
          from_state: string | null
          from_state_category: Database["public"]["Enums"]["state_category"]
          id: string
          occurred_at: string
          project_id: string
          source_rev: number | null
          tenant_id: string
          to_state: string
          to_state_category: Database["public"]["Enums"]["state_category"]
          work_item_id: string
        }
        Insert: {
          changed_by_member_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          from_state?: string | null
          from_state_category?: Database["public"]["Enums"]["state_category"]
          id?: string
          occurred_at: string
          project_id: string
          source_rev?: number | null
          tenant_id: string
          to_state: string
          to_state_category?: Database["public"]["Enums"]["state_category"]
          work_item_id: string
        }
        Update: {
          changed_by_member_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          from_state?: string | null
          from_state_category?: Database["public"]["Enums"]["state_category"]
          id?: string
          occurred_at?: string
          project_id?: string
          source_rev?: number | null
          tenant_id?: string
          to_state?: string
          to_state_category?: Database["public"]["Enums"]["state_category"]
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_item_transitions_item_fk"
            columns: ["tenant_id", "work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_item_transitions_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_work_item_type_states: {
        Row: {
          azure_category: string
          color: string | null
          created_at: string
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          project_id: string
          sort_order: number
          source_status: Database["public"]["Enums"]["source_status"]
          state_category: Database["public"]["Enums"]["state_category"]
          state_name: string
          tenant_id: string
          updated_at: string
          work_item_type_id: string
        }
        Insert: {
          azure_category: string
          color?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          project_id: string
          sort_order?: number
          source_status?: Database["public"]["Enums"]["source_status"]
          state_category?: Database["public"]["Enums"]["state_category"]
          state_name: string
          tenant_id: string
          updated_at?: string
          work_item_type_id: string
        }
        Update: {
          azure_category?: string
          color?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          project_id?: string
          sort_order?: number
          source_status?: Database["public"]["Enums"]["source_status"]
          state_category?: Database["public"]["Enums"]["state_category"]
          state_name?: string
          tenant_id?: string
          updated_at?: string
          work_item_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_item_type_states_type_fk"
            columns: ["tenant_id", "project_id", "work_item_type_id"]
            isOneToOne: false
            referencedRelation: "az_work_item_types"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      az_work_item_types: {
        Row: {
          color: string | null
          created_at: string
          deleted_at_source: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_deleted: boolean
          is_disabled: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          name: string
          organization_id: string
          project_id: string
          reference_name: string | null
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at_source?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_deleted?: boolean
          is_disabled?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name: string
          organization_id: string
          project_id: string
          reference_name?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at_source?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_deleted?: boolean
          is_disabled?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          project_id?: string
          reference_name?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_item_types_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_item_types_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      az_work_items: {
        Row: {
          access_revoked_at: string | null
          activated_date: string | null
          alias: Database["public"]["Enums"]["work_item_alias"]
          area_path: string
          assigned_to_member_id: string | null
          azure_rev: number
          azure_severity_raw: string | null
          azure_url: string | null
          azure_work_item_id: number
          azure_work_item_type: string
          blocked_since: string | null
          blocked_source_field: string | null
          board_column: string | null
          board_column_done: boolean | null
          board_column_entered_at: string | null
          board_lane: string | null
          changed_at_source: string
          changed_by_member_id: string | null
          closed_date: string | null
          completed_work: number | null
          counts_toward_scope: boolean
          created_at: string
          created_at_source: string
          created_by_member_id: string | null
          custom_fields: Json
          deleted_at_source: string | null
          description: string | null
          estimate: number | null
          estimate_source_field: string | null
          estimate_unit: string | null
          hierarchy_depth: number | null
          id: string
          is_blocked: boolean
          is_deleted: boolean
          is_leaf: boolean
          iteration_id: string | null
          iteration_path: string
          last_seen_at: string | null
          last_synced_at: string | null
          organization_id: string
          original_estimate: number | null
          parent_azure_work_item_id: number | null
          parent_work_item_id: string | null
          priority: number | null
          project_id: string
          reason: string | null
          remaining_work: number | null
          resolved_date: string | null
          severity: Database["public"]["Enums"]["severity_level"] | null
          source_status: Database["public"]["Enums"]["source_status"]
          state: string
          state_category: Database["public"]["Enums"]["state_category"]
          state_change_date: string | null
          tags: string[]
          team_id: string | null
          team_iteration_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          activated_date?: string | null
          alias?: Database["public"]["Enums"]["work_item_alias"]
          area_path?: string
          assigned_to_member_id?: string | null
          azure_rev?: number
          azure_severity_raw?: string | null
          azure_url?: string | null
          azure_work_item_id: number
          azure_work_item_type: string
          blocked_since?: string | null
          blocked_source_field?: string | null
          board_column?: string | null
          board_column_done?: boolean | null
          board_column_entered_at?: string | null
          board_lane?: string | null
          changed_at_source?: string
          changed_by_member_id?: string | null
          closed_date?: string | null
          completed_work?: number | null
          counts_toward_scope?: boolean
          created_at?: string
          created_at_source?: string
          created_by_member_id?: string | null
          custom_fields?: Json
          deleted_at_source?: string | null
          description?: string | null
          estimate?: number | null
          estimate_source_field?: string | null
          estimate_unit?: string | null
          hierarchy_depth?: number | null
          id?: string
          is_blocked?: boolean
          is_deleted?: boolean
          is_leaf?: boolean
          iteration_id?: string | null
          iteration_path?: string
          last_seen_at?: string | null
          last_synced_at?: string | null
          organization_id: string
          original_estimate?: number | null
          parent_azure_work_item_id?: number | null
          parent_work_item_id?: string | null
          priority?: number | null
          project_id: string
          reason?: string | null
          remaining_work?: number | null
          resolved_date?: string | null
          severity?: Database["public"]["Enums"]["severity_level"] | null
          source_status?: Database["public"]["Enums"]["source_status"]
          state: string
          state_category?: Database["public"]["Enums"]["state_category"]
          state_change_date?: string | null
          tags?: string[]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          activated_date?: string | null
          alias?: Database["public"]["Enums"]["work_item_alias"]
          area_path?: string
          assigned_to_member_id?: string | null
          azure_rev?: number
          azure_severity_raw?: string | null
          azure_url?: string | null
          azure_work_item_id?: number
          azure_work_item_type?: string
          blocked_since?: string | null
          blocked_source_field?: string | null
          board_column?: string | null
          board_column_done?: boolean | null
          board_column_entered_at?: string | null
          board_lane?: string | null
          changed_at_source?: string
          changed_by_member_id?: string | null
          closed_date?: string | null
          completed_work?: number | null
          counts_toward_scope?: boolean
          created_at?: string
          created_at_source?: string
          created_by_member_id?: string | null
          custom_fields?: Json
          deleted_at_source?: string | null
          description?: string | null
          estimate?: number | null
          estimate_source_field?: string | null
          estimate_unit?: string | null
          hierarchy_depth?: number | null
          id?: string
          is_blocked?: boolean
          is_deleted?: boolean
          is_leaf?: boolean
          iteration_id?: string | null
          iteration_path?: string
          last_seen_at?: string | null
          last_synced_at?: string | null
          organization_id?: string
          original_estimate?: number | null
          parent_azure_work_item_id?: number | null
          parent_work_item_id?: string | null
          priority?: number | null
          project_id?: string
          reason?: string | null
          remaining_work?: number | null
          resolved_date?: string | null
          severity?: Database["public"]["Enums"]["severity_level"] | null
          source_status?: Database["public"]["Enums"]["source_status"]
          state?: string
          state_category?: Database["public"]["Enums"]["state_category"]
          state_change_date?: string | null
          tags?: string[]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "az_work_items_assignee_fk"
            columns: ["tenant_id", "assigned_to_member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_items_iteration_fk"
            columns: ["tenant_id", "project_id", "iteration_id"]
            isOneToOne: false
            referencedRelation: "core_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_work_items_parent_fk"
            columns: ["tenant_id", "parent_work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_items_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "az_work_items_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "az_work_items_team_iteration_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      core_iterations: {
        Row: {
          access_revoked_at: string | null
          azure_iteration_id: string
          azure_iteration_path: string
          created_at: string
          deleted_at_source: string | null
          finish_date: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          name_ar: string
          name_en: string
          organization_id: string
          phase: Database["public"]["Enums"]["iteration_phase"]
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          start_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_iteration_id: string
          azure_iteration_path: string
          created_at?: string
          deleted_at_source?: string | null
          finish_date?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar: string
          name_en: string
          organization_id: string
          phase?: Database["public"]["Enums"]["iteration_phase"]
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          start_date?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_iteration_id?: string
          azure_iteration_path?: string
          created_at?: string
          deleted_at_source?: string | null
          finish_date?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar?: string
          name_en?: string
          organization_id?: string
          phase?: Database["public"]["Enums"]["iteration_phase"]
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          start_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_iterations_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_iterations_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_member_capacity: {
        Row: {
          access_revoked_at: string | null
          activity: string | null
          capacity_per_day: number
          created_at: string
          days_off: Json
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          member_id: string
          net_capacity_hours: number | null
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          team_iteration_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          activity?: string | null
          capacity_per_day?: number
          created_at?: string
          days_off?: Json
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          member_id: string
          net_capacity_hours?: number | null
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          team_iteration_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          activity?: string | null
          capacity_per_day?: number
          created_at?: string
          days_off?: Json
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          member_id?: string
          net_capacity_hours?: number | null
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          team_iteration_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_member_capacity_member_fk"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_member_capacity_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      core_members: {
        Row: {
          access_revoked_at: string | null
          azure_descriptor: string
          azure_unique_name: string | null
          created_at: string
          deleted_at_source: string | null
          display_name: string
          email: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          organization_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_descriptor: string
          azure_unique_name?: string | null
          created_at?: string
          deleted_at_source?: string | null
          display_name: string
          email?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          organization_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_descriptor?: string
          azure_unique_name?: string | null
          created_at?: string
          deleted_at_source?: string | null
          display_name?: string
          email?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          organization_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_members_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_organizations: {
        Row: {
          access_revoked_at: string | null
          azure_organization_id: string | null
          azure_organization_name: string
          base_url: string
          created_at: string
          deleted_at_source: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          name_ar: string
          name_en: string
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          azure_organization_id?: string | null
          azure_organization_name: string
          base_url: string
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar: string
          name_en: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          azure_organization_id?: string | null
          azure_organization_name?: string
          base_url?: string
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar?: string
          name_en?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_organizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      core_process_mappings: {
        Row: {
          active_states: string[]
          blocked_fields: string[]
          bug_handling_mode: Database["public"]["Enums"]["bug_handling_mode"]
          created_at: string
          done_states: string[]
          estimate_fields: string[]
          hierarchy_rules: Json
          id: string
          kind: Database["public"]["Enums"]["process_template_kind"]
          notes: Json
          project_id: string
          rollup_mode: Database["public"]["Enums"]["rollup_mode"]
          severity_field: string | null
          state_category_map: Json
          team_id: string | null
          tenant_id: string
          updated_at: string
          work_item_type_aliases: Json
        }
        Insert: {
          active_states?: string[]
          blocked_fields?: string[]
          bug_handling_mode?: Database["public"]["Enums"]["bug_handling_mode"]
          created_at?: string
          done_states?: string[]
          estimate_fields?: string[]
          hierarchy_rules?: Json
          id?: string
          kind?: Database["public"]["Enums"]["process_template_kind"]
          notes?: Json
          project_id: string
          rollup_mode?: Database["public"]["Enums"]["rollup_mode"]
          severity_field?: string | null
          state_category_map?: Json
          team_id?: string | null
          tenant_id: string
          updated_at?: string
          work_item_type_aliases?: Json
        }
        Update: {
          active_states?: string[]
          blocked_fields?: string[]
          bug_handling_mode?: Database["public"]["Enums"]["bug_handling_mode"]
          created_at?: string
          done_states?: string[]
          estimate_fields?: string[]
          hierarchy_rules?: Json
          id?: string
          kind?: Database["public"]["Enums"]["process_template_kind"]
          notes?: Json
          project_id?: string
          rollup_mode?: Database["public"]["Enums"]["rollup_mode"]
          severity_field?: string | null
          state_category_map?: Json
          team_id?: string | null
          tenant_id?: string
          updated_at?: string
          work_item_type_aliases?: Json
        }
        Relationships: [
          {
            foreignKeyName: "core_process_mappings_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_process_mappings_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      core_projects: {
        Row: {
          access_revoked_at: string | null
          azure_project_id: string
          azure_project_name: string
          created_at: string
          custom_fields: Json
          deleted_at_source: string | null
          description: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          name_ar: string
          name_en: string
          organization_id: string
          process_template_kind: Database["public"]["Enums"]["process_template_kind"]
          process_template_name: string | null
          source_status: Database["public"]["Enums"]["source_status"]
          state: string
          tenant_id: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          access_revoked_at?: string | null
          azure_project_id: string
          azure_project_name: string
          created_at?: string
          custom_fields?: Json
          deleted_at_source?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar: string
          name_en: string
          organization_id: string
          process_template_kind?: Database["public"]["Enums"]["process_template_kind"]
          process_template_name?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          state?: string
          tenant_id: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          access_revoked_at?: string | null
          azure_project_id?: string
          azure_project_name?: string
          created_at?: string
          custom_fields?: Json
          deleted_at_source?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar?: string
          name_en?: string
          organization_id?: string
          process_template_kind?: Database["public"]["Enums"]["process_template_kind"]
          process_template_name?: string | null
          source_status?: Database["public"]["Enums"]["source_status"]
          state?: string
          tenant_id?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "core_projects_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_team_iterations: {
        Row: {
          access_revoked_at: string | null
          created_at: string
          deleted_at_source: string | null
          id: string
          is_current: boolean
          is_deleted: boolean
          iteration_id: string
          last_seen_at: string | null
          last_synced_at: string | null
          non_working_days: Json
          organization_id: string
          phase: Database["public"]["Enums"]["iteration_phase"]
          project_id: string
          selected_for_sync: boolean
          source_status: Database["public"]["Enums"]["source_status"]
          team_id: string
          tenant_id: string
          time_zone: string
          updated_at: string
          working_weekdays: number[]
        }
        Insert: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_current?: boolean
          is_deleted?: boolean
          iteration_id: string
          last_seen_at?: string | null
          last_synced_at?: string | null
          non_working_days?: Json
          organization_id: string
          phase?: Database["public"]["Enums"]["iteration_phase"]
          project_id: string
          selected_for_sync?: boolean
          source_status?: Database["public"]["Enums"]["source_status"]
          team_id: string
          tenant_id: string
          time_zone?: string
          updated_at?: string
          working_weekdays?: number[]
        }
        Update: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_current?: boolean
          is_deleted?: boolean
          iteration_id?: string
          last_seen_at?: string | null
          last_synced_at?: string | null
          non_working_days?: Json
          organization_id?: string
          phase?: Database["public"]["Enums"]["iteration_phase"]
          project_id?: string
          selected_for_sync?: boolean
          source_status?: Database["public"]["Enums"]["source_status"]
          team_id?: string
          tenant_id?: string
          time_zone?: string
          updated_at?: string
          working_weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "core_team_iterations_iteration_fk"
            columns: ["tenant_id", "project_id", "iteration_id"]
            isOneToOne: false
            referencedRelation: "core_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "core_team_iterations_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      core_team_memberships: {
        Row: {
          access_revoked_at: string | null
          created_at: string
          deleted_at_source: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          joined_at: string | null
          last_seen_at: string | null
          left_at: string | null
          member_id: string
          project_id: string
          role: string
          source_status: Database["public"]["Enums"]["source_status"]
          team_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          joined_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          member_id: string
          project_id: string
          role?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          team_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          created_at?: string
          deleted_at_source?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          joined_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          member_id?: string
          project_id?: string
          role?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          team_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_team_memberships_member_fk"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_team_memberships_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      core_teams: {
        Row: {
          access_revoked_at: string | null
          area_paths: string[]
          azure_team_id: string
          azure_team_name: string
          created_at: string
          default_iteration_path: string | null
          deleted_at_source: string | null
          description: string | null
          id: string
          is_deleted: boolean
          last_seen_at: string | null
          last_synced_at: string | null
          name_ar: string
          name_en: string
          organization_id: string
          process_mapping_id: string | null
          project_id: string
          source_status: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_revoked_at?: string | null
          area_paths?: string[]
          azure_team_id: string
          azure_team_name: string
          created_at?: string
          default_iteration_path?: string | null
          deleted_at_source?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar: string
          name_en: string
          organization_id: string
          process_mapping_id?: string | null
          project_id: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_revoked_at?: string | null
          area_paths?: string[]
          azure_team_id?: string
          azure_team_name?: string
          created_at?: string
          default_iteration_path?: string | null
          deleted_at_source?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          last_seen_at?: string | null
          last_synced_at?: string | null
          name_ar?: string
          name_en?: string
          organization_id?: string
          process_mapping_id?: string | null
          project_id?: string
          source_status?: Database["public"]["Enums"]["source_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_teams_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_teams_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_tenant_retention_settings: {
        Row: {
          created_at: string
          id: string
          legal_hold: boolean
          minimum_days: number
          notes: string | null
          retention_days: number
          rule_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_hold?: boolean
          minimum_days: number
          notes?: string | null
          retention_days: number
          rule_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_hold?: boolean
          minimum_days?: number
          notes?: string | null
          retention_days?: number
          rule_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_tenant_retention_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      core_tenants: {
        Row: {
          created_at: string
          default_time_zone: string
          id: string
          is_active: boolean
          is_demo: boolean
          legal_hold: boolean
          name_ar: string
          name_en: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_time_zone?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          legal_hold?: boolean
          name_ar: string
          name_en: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_time_zone?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          legal_hold?: boolean
          name_ar?: string
          name_en?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      core_user_project_scopes: {
        Row: {
          closed_reason: string | null
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by_user_id: string | null
          id: string
          idempotency_key: string | null
          project_id: string
          reason: string | null
          revoked_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_reason?: string | null
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          project_id: string
          reason?: string | null
          revoked_at?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_reason?: string | null
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          project_id?: string
          reason?: string | null
          revoked_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_user_project_scopes_granted_by_fk"
            columns: ["tenant_id", "granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_user_project_scopes_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_user_project_scopes_user_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_user_roles: {
        Row: {
          created_at: string
          granted_at: string
          granted_by_user_id: string | null
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by_user_id?: string | null
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by_user_id?: string | null
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_user_roles_granted_by_fk"
            columns: ["tenant_id", "granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_user_roles_user_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_user_team_scopes: {
        Row: {
          closed_reason: string | null
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by_user_id: string | null
          id: string
          idempotency_key: string | null
          reason: string | null
          revoked_at: string | null
          team_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_reason?: string | null
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
          revoked_at?: string | null
          team_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_reason?: string | null
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
          revoked_at?: string | null
          team_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_user_team_scopes_granted_by_fk"
            columns: ["tenant_id", "granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_user_team_scopes_team_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_user_team_scopes_user_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      core_users: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          locale: string
          member_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          locale?: string
          member_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          locale?: string
          member_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_users_member_tenant_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "core_members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "core_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_copilot_answers: {
        Row: {
          answer: string
          asked_by_user_id: string | null
          citations: Json
          created_at: string
          id: string
          locale: string
          model_name: string
          origin: Database["public"]["Enums"]["content_origin"]
          project_id: string | null
          question: string
          team_iteration_id: string | null
          tenant_id: string
        }
        Insert: {
          answer: string
          asked_by_user_id?: string | null
          citations?: Json
          created_at?: string
          id?: string
          locale?: string
          model_name: string
          origin?: Database["public"]["Enums"]["content_origin"]
          project_id?: string | null
          question: string
          team_iteration_id?: string | null
          tenant_id: string
        }
        Update: {
          answer?: string
          asked_by_user_id?: string | null
          citations?: Json
          created_at?: string
          id?: string
          locale?: string
          model_name?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          project_id?: string | null
          question?: string
          team_iteration_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_copilot_answers_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "intel_copilot_answers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_copilot_answers_user_fk"
            columns: ["tenant_id", "asked_by_user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      intel_recommendation_decisions: {
        Row: {
          created_at: string
          decided_at: string
          decided_by_user_id: string | null
          decision: Database["public"]["Enums"]["recommendation_status"]
          id: string
          rationale: string | null
          recommendation_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decided_by_user_id?: string | null
          decision: Database["public"]["Enums"]["recommendation_status"]
          id?: string
          rationale?: string | null
          recommendation_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          decided_by_user_id?: string | null
          decision?: Database["public"]["Enums"]["recommendation_status"]
          id?: string
          rationale?: string | null
          recommendation_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_recommendation_decisions_rec_fk"
            columns: ["tenant_id", "recommendation_id"]
            isOneToOne: false
            referencedRelation: "intel_recommendations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "intel_recommendation_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendation_decisions_user_fk"
            columns: ["tenant_id", "decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "core_users"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      intel_recommendations: {
        Row: {
          body_ar: string | null
          body_en: string | null
          created_at: string
          effort: string | null
          evidence_refs: Json
          expected_impact: string | null
          id: string
          model_name: string | null
          origin: Database["public"]["Enums"]["content_origin"]
          priority: number
          project_id: string | null
          risk_signal_id: string | null
          rule_id: string | null
          status: Database["public"]["Enums"]["recommendation_status"]
          team_id: string | null
          team_iteration_id: string | null
          tenant_id: string
          title_ar: string
          title_en: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          effort?: string | null
          evidence_refs?: Json
          expected_impact?: string | null
          id?: string
          model_name?: string | null
          origin?: Database["public"]["Enums"]["content_origin"]
          priority?: number
          project_id?: string | null
          risk_signal_id?: string | null
          rule_id?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id: string
          title_ar: string
          title_en: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          effort?: string | null
          evidence_refs?: Json
          expected_impact?: string | null
          id?: string
          model_name?: string | null
          origin?: Database["public"]["Enums"]["content_origin"]
          priority?: number
          project_id?: string | null
          risk_signal_id?: string | null
          rule_id?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_recommendations_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "intel_recommendations_signal_fk"
            columns: ["tenant_id", "risk_signal_id"]
            isOneToOne: false
            referencedRelation: "intel_risk_signals"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "intel_recommendations_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "intel_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      intel_risk_signals: {
        Row: {
          created_at: string
          detail_ar: string | null
          detail_en: string | null
          evidence: Json
          first_detected_at: string
          id: string
          last_detected_at: string
          origin: Database["public"]["Enums"]["content_origin"]
          project_id: string | null
          resolved_at: string | null
          rule_id: string
          rule_version: number
          scope_hash: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["risk_status"]
          team_id: string | null
          team_iteration_id: string | null
          tenant_id: string
          title_ar: string
          title_en: string
          updated_at: string
          work_item_id: string | null
        }
        Insert: {
          created_at?: string
          detail_ar?: string | null
          detail_en?: string | null
          evidence?: Json
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          project_id?: string | null
          resolved_at?: string | null
          rule_id: string
          rule_version?: number
          scope_hash?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["risk_status"]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id: string
          title_ar: string
          title_en: string
          updated_at?: string
          work_item_id?: string | null
        }
        Update: {
          created_at?: string
          detail_ar?: string | null
          detail_en?: string | null
          evidence?: Json
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          project_id?: string | null
          resolved_at?: string | null
          rule_id?: string
          rule_version?: number
          scope_hash?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["risk_status"]
          team_id?: string | null
          team_iteration_id?: string | null
          tenant_id?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_risk_signals_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "intel_risk_signals_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "intel_risk_signals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_risk_signals_ti_fk"
            columns: ["tenant_id", "project_id", "team_iteration_id"]
            isOneToOne: false
            referencedRelation: "core_team_iterations"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
          {
            foreignKeyName: "intel_risk_signals_work_item_fk"
            columns: ["tenant_id", "work_item_id"]
            isOneToOne: false
            referencedRelation: "az_work_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ops_cron_nonces: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string | null
          nonce: string
          purpose: string
          seen_at: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key?: string | null
          nonce: string
          purpose: string
          seen_at?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          nonce?: string
          purpose?: string
          seen_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_cron_nonces_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "core_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_data_quality_issues: {
        Row: {
          created_at: string
          details: Json
          entity_id: string | null
          entity_kind: string
          field: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          message_ar: string
          message_en: string
          project_id: string | null
          resolved_at: string | null
          rule_id: string
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["issue_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_kind: string
          field?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message_ar: string
          message_en: string
          project_id?: string | null
          resolved_at?: string | null
          rule_id: string
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["issue_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_kind?: string
          field?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message_ar?: string
          message_en?: string
          project_id?: string | null
          resolved_at?: string | null
          rule_id?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["issue_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_data_quality_issues_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ops_snapshot_job_runs: {
        Row: {
          created_at: string
          details: Json
          finalized_at: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          logical_date: string
          project_id: string
          rows_written: number
          started_at: string | null
          status: Database["public"]["Enums"]["sync_run_status"]
          team_id: string
          tenant_id: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          logical_date: string
          project_id: string
          rows_written?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
          team_id: string
          tenant_id: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          logical_date?: string
          project_id?: string
          rows_written?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
          team_id?: string
          tenant_id?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_snapshot_job_runs_team_fk"
            columns: ["tenant_id", "project_id", "team_id"]
            isOneToOne: false
            referencedRelation: "core_teams"
            referencedColumns: ["tenant_id", "project_id", "id"]
          },
        ]
      }
      ops_sync_connections: {
        Row: {
          auth_mode: Database["public"]["Enums"]["sync_auth_mode"]
          configuration: Json
          created_at: string
          id: string
          last_verified_at: string | null
          organization_id: string
          secret_ref: string | null
          status: Database["public"]["Enums"]["connection_status"]
          status_message: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_mode?: Database["public"]["Enums"]["sync_auth_mode"]
          configuration?: Json
          created_at?: string
          id?: string
          last_verified_at?: string | null
          organization_id: string
          secret_ref?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          status_message?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_mode?: Database["public"]["Enums"]["sync_auth_mode"]
          configuration?: Json
          created_at?: string
          id?: string
          last_verified_at?: string | null
          organization_id?: string
          secret_ref?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          status_message?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_sync_connections_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: true
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ops_sync_cursors: {
        Row: {
          connection_id: string
          created_at: string
          entity_kind: string
          id: string
          last_run_id: string | null
          project_id: string | null
          tenant_id: string
          updated_at: string
          watermark_at: string | null
          watermark_token: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          entity_kind: string
          id?: string
          last_run_id?: string | null
          project_id?: string | null
          tenant_id: string
          updated_at?: string
          watermark_at?: string | null
          watermark_token?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          entity_kind?: string
          id?: string
          last_run_id?: string | null
          project_id?: string | null
          tenant_id?: string
          updated_at?: string
          watermark_at?: string | null
          watermark_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_sync_cursors_connection_fk"
            columns: ["tenant_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "ops_sync_connections"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ops_sync_cursors_project_fk"
            columns: ["tenant_id", "project_id"]
            isOneToOne: false
            referencedRelation: "core_projects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ops_sync_locks: {
        Row: {
          acquired_at: string
          created_at: string
          expires_at: string
          holder: string | null
          id: string
          organization_id: string
          released_at: string | null
          run_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acquired_at?: string
          created_at?: string
          expires_at: string
          holder?: string | null
          id?: string
          organization_id: string
          released_at?: string | null
          run_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acquired_at?: string
          created_at?: string
          expires_at?: string
          holder?: string | null
          id?: string
          organization_id?: string
          released_at?: string | null
          run_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_sync_locks_org_fk"
            columns: ["tenant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "core_organizations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ops_sync_runs: {
        Row: {
          connection_id: string
          correlation_id: string | null
          created_at: string
          details: Json
          entity_kinds: string[]
          error_count: number
          finalized_at: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          items_read: number
          items_written: number
          organization_id: string
          project_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["sync_run_status"]
          tenant_id: string
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          correlation_id?: string | null
          created_at?: string
          details?: Json
          entity_kinds?: string[]
          error_count?: number
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          items_read?: number
          items_written?: number
          organization_id: string
          project_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
          tenant_id: string
          trigger_kind?: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          correlation_id?: string | null
          created_at?: string
          details?: Json
          entity_kinds?: string[]
          error_count?: number
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          items_read?: number
          items_written?: number
          organization_id?: string
          project_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
          tenant_id?: string
          trigger_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_sync_runs_connection_fk"
            columns: ["tenant_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "ops_sync_connections"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_first_tenant_admin: {
        Args: {
          p_auth_user_id: string
          p_display_name: string
          p_email: string
          p_tenant_name: string
          p_tenant_slug: string
        }
        Returns: Json
      }
      can_view_member_detail: {
        Args: { target_team_id: string; target_tenant_id: string }
        Returns: boolean
      }
      current_core_user_id: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      grant_project_scope: {
        Args: {
          _expires_at?: string
          _granted_by: string
          _idempotency_key?: string
          _project_id: string
          _reason?: string
          _tenant_id: string
          _user_id: string
        }
        Returns: string
      }
      grant_team_scope: {
        Args: {
          _expires_at?: string
          _granted_by: string
          _idempotency_key?: string
          _reason?: string
          _team_id: string
          _tenant_id: string
          _user_id: string
        }
        Returns: string
      }
      has_full_tenant_access: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      has_project_access: {
        Args: { target_project_id: string; target_tenant_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          target_role: Database["public"]["Enums"]["app_role"]
          target_tenant_id: string
        }
        Returns: boolean
      }
      has_team_access: {
        Args: { target_team_id: string; target_tenant_id: string }
        Returns: boolean
      }
      has_tenant_access: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      is_own_member_record: {
        Args: { target_member_id: string; target_tenant_id: string }
        Returns: boolean
      }
      is_tenant_admin: { Args: { target_tenant_id: string }; Returns: boolean }
      is_tenant_platform_admin: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      purge_ci_tenant: { Args: { _tenant_id: string }; Returns: number }
      real_tenant_exists: { Args: never; Returns: boolean }
      remove_demo_tenant: { Args: never; Returns: number }
      seed_demo_tenant: { Args: never; Returns: string }
      write_audit_event: {
        Args: {
          _action: string
          _actor_user_id: string
          _entity_id: string
          _entity_type: string
          _idempotency_key?: string
          _metadata?: Json
          _outcome?: Database["public"]["Enums"]["audit_outcome"]
          _tenant_id: string
        }
        Returns: string
      }
    }
    Enums: {
      actor_type: "user" | "service" | "system" | "scheduler"
      app_role:
        | "platform_admin"
        | "tenant_admin"
        | "executive_viewer"
        | "delivery_manager"
        | "team_lead"
        | "contributor"
        | "qa_release_owner"
        | "readonly_viewer"
      audit_outcome: "success" | "failure" | "denied" | "noop"
      bug_handling_mode: "as_requirement" | "as_task" | "excluded"
      connection_status:
        | "unconfigured"
        | "pending"
        | "connected"
        | "error"
        | "disabled"
      content_origin: "deterministic" | "ai_generated" | "human"
      health_status: "good" | "watch" | "risk" | "critical" | "unknown"
      issue_status: "open" | "acknowledged" | "resolved" | "ignored"
      iteration_phase: "future" | "current" | "completed" | "undated"
      kpi_direction: "higherIsBetter" | "lowerIsBetter" | "targetBand"
      kpi_scope_level: "global" | "tenant" | "project" | "team"
      process_template_kind: "agile" | "scrum" | "cmmi" | "basic" | "custom"
      pull_request_status:
        | "active"
        | "abandoned"
        | "completed"
        | "notSet"
        | "unknown"
      recommendation_status:
        | "proposed"
        | "accepted"
        | "rejected"
        | "deferred"
        | "completed"
      review_vote:
        | "approved"
        | "approvedWithSuggestions"
        | "noVote"
        | "waitingForAuthor"
        | "rejected"
      risk_status: "open" | "mitigating" | "resolved" | "dismissed"
      rollup_mode:
        | "leaf_only"
        | "parent_only"
        | "process_mapping"
        | "story_level"
      run_result:
        | "succeeded"
        | "partiallySucceeded"
        | "failed"
        | "canceled"
        | "none"
        | "unknown"
      run_state:
        | "notStarted"
        | "inProgress"
        | "completed"
        | "canceling"
        | "postponed"
        | "unknown"
      scope_target: "project" | "team"
      severity_level: "critical" | "high" | "medium" | "low" | "unknown"
      source_status: "active" | "deleted" | "inaccessible" | "unknown"
      state_category:
        | "proposed"
        | "inProgress"
        | "resolved"
        | "completed"
        | "removed"
        | "unknown"
      sync_auth_mode: "pat" | "oauth" | "managed_identity" | "none"
      sync_run_status:
        | "queued"
        | "running"
        | "succeeded"
        | "partial"
        | "failed"
        | "skipped"
      work_item_alias:
        | "epic"
        | "feature"
        | "story"
        | "requirement"
        | "issue"
        | "bug"
        | "task"
        | "testCase"
        | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      actor_type: ["user", "service", "system", "scheduler"],
      app_role: [
        "platform_admin",
        "tenant_admin",
        "executive_viewer",
        "delivery_manager",
        "team_lead",
        "contributor",
        "qa_release_owner",
        "readonly_viewer",
      ],
      audit_outcome: ["success", "failure", "denied", "noop"],
      bug_handling_mode: ["as_requirement", "as_task", "excluded"],
      connection_status: [
        "unconfigured",
        "pending",
        "connected",
        "error",
        "disabled",
      ],
      content_origin: ["deterministic", "ai_generated", "human"],
      health_status: ["good", "watch", "risk", "critical", "unknown"],
      issue_status: ["open", "acknowledged", "resolved", "ignored"],
      iteration_phase: ["future", "current", "completed", "undated"],
      kpi_direction: ["higherIsBetter", "lowerIsBetter", "targetBand"],
      kpi_scope_level: ["global", "tenant", "project", "team"],
      process_template_kind: ["agile", "scrum", "cmmi", "basic", "custom"],
      pull_request_status: [
        "active",
        "abandoned",
        "completed",
        "notSet",
        "unknown",
      ],
      recommendation_status: [
        "proposed",
        "accepted",
        "rejected",
        "deferred",
        "completed",
      ],
      review_vote: [
        "approved",
        "approvedWithSuggestions",
        "noVote",
        "waitingForAuthor",
        "rejected",
      ],
      risk_status: ["open", "mitigating", "resolved", "dismissed"],
      rollup_mode: [
        "leaf_only",
        "parent_only",
        "process_mapping",
        "story_level",
      ],
      run_result: [
        "succeeded",
        "partiallySucceeded",
        "failed",
        "canceled",
        "none",
        "unknown",
      ],
      run_state: [
        "notStarted",
        "inProgress",
        "completed",
        "canceling",
        "postponed",
        "unknown",
      ],
      scope_target: ["project", "team"],
      severity_level: ["critical", "high", "medium", "low", "unknown"],
      source_status: ["active", "deleted", "inaccessible", "unknown"],
      state_category: [
        "proposed",
        "inProgress",
        "resolved",
        "completed",
        "removed",
        "unknown",
      ],
      sync_auth_mode: ["pat", "oauth", "managed_identity", "none"],
      sync_run_status: [
        "queued",
        "running",
        "succeeded",
        "partial",
        "failed",
        "skipped",
      ],
      work_item_alias: [
        "epic",
        "feature",
        "story",
        "requirement",
        "issue",
        "bug",
        "task",
        "testCase",
        "custom",
      ],
    },
  },
} as const
