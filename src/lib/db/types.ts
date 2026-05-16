import type {
  DeploymentStatus,
  StoreStatus,
  WorkflowEventStatus,
  WorkflowRunStatus,
} from "@/lib/db/schema";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          clerk_user_id: string;
          name: string;
          slug: string;
          business_idea: string;
          original_prompt: string;
          blueprint_json: Json;
          status: StoreStatus;
          product_count: number;
          source_template_repo: string;
          generated_repo_owner: string | null;
          generated_repo_name: string | null;
          generated_repo_full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          name: string;
          slug: string;
          business_idea: string;
          original_prompt: string;
          blueprint_json: Json;
          status?: StoreStatus;
          product_count: number;
          source_template_repo: string;
          generated_repo_owner?: string | null;
          generated_repo_name?: string | null;
          generated_repo_full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stores"]["Insert"]>;
        Relationships: [];
      };
      workflow_runs: {
        Row: {
          id: string;
          store_id: string;
          workflow_name: string;
          provider_run_id: string | null;
          status: WorkflowRunStatus;
          current_step: string | null;
          repair_count: number;
          logs_summary: Json;
          modified_files_summary: Json;
          codex_activity_summary: Json;
          workspace_path: string | null;
          artifact_metadata: Json;
          started_at: string;
          completed_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          workflow_name: string;
          provider_run_id?: string | null;
          status?: WorkflowRunStatus;
          current_step?: string | null;
          repair_count?: number;
          logs_summary?: Json;
          modified_files_summary?: Json;
          codex_activity_summary?: Json;
          workspace_path?: string | null;
          artifact_metadata?: Json;
          started_at?: string;
          completed_at?: string | null;
          error_message?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["workflow_runs"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "workflow_runs_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_events: {
        Row: {
          id: string;
          workflow_run_id: string;
          store_id: string;
          trace_id: string;
          span_id: string;
          parent_span_id: string | null;
          event_name: string;
          step: string;
          status: WorkflowEventStatus;
          message: string;
          duration_ms: number | null;
          attributes: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workflow_run_id: string;
          store_id: string;
          trace_id: string;
          span_id?: string;
          parent_span_id?: string | null;
          event_name: string;
          step: string;
          status: WorkflowEventStatus;
          message: string;
          duration_ms?: number | null;
          attributes?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["workflow_events"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "workflow_events_workflow_run_id_fkey";
            columns: ["workflow_run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_events_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      deployment_metadata: {
        Row: {
          id: string;
          store_id: string;
          vercel_project_id: string | null;
          vercel_deployment_id: string | null;
          deployment_url: string | null;
          preview_url: string | null;
          production_url: string | null;
          environment: "preview" | "production";
          status: DeploymentStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          vercel_project_id?: string | null;
          vercel_deployment_id?: string | null;
          deployment_url?: string | null;
          preview_url?: string | null;
          production_url?: string | null;
          environment?: "preview" | "production";
          status?: DeploymentStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["deployment_metadata"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "deployment_metadata_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
