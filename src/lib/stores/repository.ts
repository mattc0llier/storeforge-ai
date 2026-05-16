import { StoreSchema } from "@/lib/db/schema";
import type { Database, Json } from "@/lib/db/types";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  StoreBlueprintSchema,
  type StoreBlueprint,
} from "@/lib/store-generation/store-blueprint";

type CreateStoreJobInput = {
  userId: string;
  originalPrompt: string;
  blueprint: StoreBlueprint;
};

type UpdateStoreBlueprintInput = {
  storeId: string;
  blueprint: StoreBlueprint;
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

export async function updateStoreBlueprint({
  storeId,
  blueprint,
}: UpdateStoreBlueprintInput) {
  const supabase = getSupabaseAdminClient();
  const parsedBlueprint = StoreBlueprintSchema.parse(blueprint);

  const { data, error } = await supabase
    .from("stores")
    .update({
      name: parsedBlueprint.storeName,
      blueprint_json: parsedBlueprint as unknown as Json,
      product_count: parsedBlueprint.products.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update store blueprint: ${error.message}`);
  }

  return mapStoreRow(data);
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

function createStoreSlug(name: string, storeId: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${base || "store"}-${storeId.slice(0, 8)}`;
}
