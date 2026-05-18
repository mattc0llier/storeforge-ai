import { DeploymentMetadataSchema, StoreSchema } from "@/lib/db/schema";
import type { Database, Json } from "@/lib/db/types";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  createPendingStoreBlueprint,
  StoreBlueprintSchema,
  type StoreBlueprint,
} from "@/lib/store-generation/store-blueprint";

type CreateStoreJobInput = {
  userId: string;
  originalPrompt: string;
  blueprint: StoreBlueprint;
};

type CreatePendingStoreJobInput = {
  userId: string;
  originalPrompt: string;
};

type UpdateStoreBlueprintInput = {
  storeId: string;
  blueprint: StoreBlueprint;
  status?: Database["public"]["Tables"]["stores"]["Row"]["status"];
};

type StoreDashboardInput = {
  userId: string;
  limit?: number;
};

export type StoreDashboardData = {
  stores: DashboardStore[];
  storeCount: number;
  workflowRunCount: number;
  deploymentCount: number;
};

export type DashboardStore = ReturnType<typeof mapStoreRow> & {
  latestDeployment: ReturnType<typeof mapDeploymentMetadataRow> | null;
};

export async function createStoreJob({
  userId,
  originalPrompt,
  blueprint,
}: CreateStoreJobInput) {
  const supabase = getSupabaseAdminClient();
  const storeId = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = createStoreSlug(blueprint.storeName, storeId);

  const { data, error } = await supabase
    .from("stores")
    .insert({
      id: storeId,
      clerk_user_id: userId,
      name: blueprint.storeName,
      slug,
      business_idea: originalPrompt,
      original_prompt: originalPrompt,
      blueprint_json: blueprint as unknown as Json,
      status: "draft",
      product_count: blueprint.products.length,
      source_template_repo: "vercel/commerce",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create store job: ${error.message}`);
  }

  return mapStoreRow(data);
}

export async function createPendingStoreJob({
  userId,
  originalPrompt,
}: CreatePendingStoreJobInput) {
  const supabase = getSupabaseAdminClient();
  const storeId = crypto.randomUUID();
  const now = new Date().toISOString();
  const blueprint = createPendingStoreBlueprint(originalPrompt);
  const slug = createStoreSlug("generating-store", storeId);

  const { data, error } = await supabase
    .from("stores")
    .insert({
      id: storeId,
      clerk_user_id: userId,
      name: blueprint.storeName,
      slug,
      business_idea: originalPrompt,
      original_prompt: originalPrompt,
      blueprint_json: blueprint as unknown as Json,
      status: "generating",
      product_count: blueprint.products.length,
      source_template_repo: "vercel/commerce",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create store job: ${error.message}`);
  }

  return mapStoreRow(data);
}

export async function getStoreJob(storeId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load store job: ${error.message}`);
  }

  return data ? mapStoreRow(data) : null;
}

export async function getLatestDeploymentMetadataForStore(storeId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("deployment_metadata")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load deployment metadata: ${error.message}`);
  }

  return data ? mapDeploymentMetadataRow(data) : null;
}

export async function updateStoreBlueprint({
  storeId,
  blueprint,
  status,
}: UpdateStoreBlueprintInput) {
  const supabase = getSupabaseAdminClient();
  const parsedBlueprint = StoreBlueprintSchema.parse(blueprint);
  const update: Database["public"]["Tables"]["stores"]["Update"] = {
    name: parsedBlueprint.storeName,
    slug: createStoreSlug(parsedBlueprint.storeName, storeId),
    blueprint_json: parsedBlueprint as unknown as Json,
    product_count: parsedBlueprint.products.length,
    updated_at: new Date().toISOString(),
  };

  if (status) {
    update.status = status;
  }

  const { data, error } = await supabase
    .from("stores")
    .update(update)
    .eq("id", storeId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update store blueprint: ${error.message}`);
  }

  return mapStoreRow(data);
}

export async function getStoreDashboardData({
  userId,
  limit = 20,
}: StoreDashboardInput): Promise<StoreDashboardData> {
  const supabase = getSupabaseAdminClient();

  const { data: storeIds, error: storeIdsError } = await supabase
    .from("stores")
    .select("id")
    .eq("clerk_user_id", userId);

  if (storeIdsError) {
    throw new Error(`Failed to load dashboard store ids: ${storeIdsError.message}`);
  }

  const ids = storeIds.map((store) => store.id);
  const [latestStores, workflowRunCount, deploymentCount] = await Promise.all([
    getLatestStoresForUser(userId, limit),
    countRowsForStoreIds("workflow_runs", ids),
    countRowsForStoreIds("deployment_metadata", ids),
  ]);

  return {
    stores: latestStores,
    storeCount: ids.length,
    workflowRunCount,
    deploymentCount,
  };
}

async function getLatestStoresForUser(userId: string, limit: number) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load dashboard stores: ${error.message}`);
  }

  const stores = data.map(mapStoreRow);
  const deploymentsByStoreId = await getLatestDeploymentMetadataForStores(
    stores.map((store) => store.id),
  );

  return stores.map((store) => ({
    ...store,
    latestDeployment: deploymentsByStoreId.get(store.id) ?? null,
  }));
}

async function getLatestDeploymentMetadataForStores(storeIds: string[]) {
  const deployments = new Map<
    string,
    ReturnType<typeof mapDeploymentMetadataRow>
  >();

  if (!storeIds.length) {
    return deployments;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("deployment_metadata")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to load dashboard deployment metadata: ${error.message}`,
    );
  }

  for (const row of data) {
    if (!deployments.has(row.store_id)) {
      deployments.set(row.store_id, mapDeploymentMetadataRow(row));
    }
  }

  return deployments;
}

async function countRowsForStoreIds(
  table: "workflow_runs" | "deployment_metadata",
  storeIds: string[],
) {
  if (!storeIds.length) {
    return 0;
  }

  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("store_id", storeIds);

  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

function mapStoreRow(row: Database["public"]["Tables"]["stores"]["Row"]) {
  const blueprint = StoreBlueprintSchema.parse(row.blueprint_json);

  return StoreSchema.parse({
    id: row.id,
    clerkUserId: row.clerk_user_id,
    name: row.name,
    slug: row.slug,
    businessIdea: row.business_idea,
    originalPrompt: row.original_prompt,
    blueprint,
    status: row.status,
    productCount: row.product_count,
    sourceTemplateRepo: row.source_template_repo,
    generatedRepoOwner: row.generated_repo_owner,
    generatedRepoName: row.generated_repo_name,
    generatedRepoFullName: row.generated_repo_full_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapDeploymentMetadataRow(
  row: Database["public"]["Tables"]["deployment_metadata"]["Row"],
) {
  return DeploymentMetadataSchema.parse({
    id: row.id,
    storeId: row.store_id,
    vercelProjectId: row.vercel_project_id,
    vercelDeploymentId: row.vercel_deployment_id,
    deploymentUrl: row.deployment_url,
    previewUrl: row.preview_url,
    productionUrl: row.production_url,
    environment: row.environment,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createStoreSlug(name: string, storeId: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${base || "store"}-${storeId.slice(0, 8)}`;
}
