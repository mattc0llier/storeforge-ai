import {
  WorkflowRunSchema,
  type StoreStatus,
  type WorkflowRun,
  type WorkflowRunStatus,
} from "@/lib/db/schema";
import type { Database, Json } from "@/lib/db/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

type WorkflowRunPatch = {
  providerRunId?: string | null;
  status?: WorkflowRunStatus;
  currentStep?: string | null;
  repairCount?: number;
  logsSummary?: string[];
  modifiedFilesSummary?: string[];
  codexActivitySummary?: string[];
  workspacePath?: string | null;
  artifactMetadata?: Record<string, unknown>;
  completedAt?: string | null;
  errorMessage?: string | null;
};

export async function createGenerationWorkflowRun(storeId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({
      store_id: storeId,
      workflow_name: "generate-store",
      status: "queued",
      current_step: "queued",
      repair_count: 0,
      logs_summary: [],
      modified_files_summary: [],
      codex_activity_summary: [],
      artifact_metadata: {},
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create workflow run: ${error.message}`);
  }

  return mapWorkflowRunRow(data);
}

export async function updateWorkflowRun(
  workflowRunId: string,
  patch: WorkflowRunPatch,
) {
  const supabase = getSupabaseAdminClient();
  const update: Database["public"]["Tables"]["workflow_runs"]["Update"] = {};

  if ("providerRunId" in patch) update.provider_run_id = patch.providerRunId;
  if ("status" in patch) update.status = patch.status;
  if ("currentStep" in patch) update.current_step = patch.currentStep;
  if ("repairCount" in patch) update.repair_count = patch.repairCount;
  if ("logsSummary" in patch) update.logs_summary = patch.logsSummary;
  if ("modifiedFilesSummary" in patch) {
    update.modified_files_summary = patch.modifiedFilesSummary;
  }
  if ("codexActivitySummary" in patch) {
    update.codex_activity_summary = patch.codexActivitySummary;
  }
  if ("workspacePath" in patch) update.workspace_path = patch.workspacePath;
  if ("artifactMetadata" in patch) {
    update.artifact_metadata = patch.artifactMetadata as Json;
  }
  if ("completedAt" in patch) update.completed_at = patch.completedAt;
  if ("errorMessage" in patch) update.error_message = patch.errorMessage;

  const { data, error } = await supabase
    .from("workflow_runs")
    .update(update)
    .eq("id", workflowRunId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update workflow run: ${error.message}`);
  }

  return mapWorkflowRunRow(data);
}

export async function updateStoreStatus(
  storeId: string,
  status: StoreStatus,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("stores")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Failed to update store status: ${error.message}`);
  }
}

export async function getLatestWorkflowRunForStore(storeId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("store_id", storeId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workflow run: ${error.message}`);
  }

  return data ? mapWorkflowRunRow(data) : null;
}

function mapWorkflowRunRow(
  row: Database["public"]["Tables"]["workflow_runs"]["Row"],
): WorkflowRun {
  return WorkflowRunSchema.parse({
    id: row.id,
    storeId: row.store_id,
    workflowName: row.workflow_name,
    providerRunId: row.provider_run_id,
    status: row.status,
    currentStep: row.current_step ?? null,
    repairCount: row.repair_count ?? 0,
    logsSummary: row.logs_summary ?? [],
    modifiedFilesSummary: row.modified_files_summary ?? [],
    codexActivitySummary: row.codex_activity_summary ?? [],
    workspacePath: row.workspace_path ?? null,
    artifactMetadata: row.artifact_metadata ?? {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  });
}
