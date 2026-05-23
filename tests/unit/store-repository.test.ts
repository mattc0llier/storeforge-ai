import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database, Json } from "@/lib/db/types";
import { createMockStoreBlueprint } from "@/lib/store-generation/store-blueprint";

const supabaseMock = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdminClient: supabaseMock.getSupabaseAdminClient,
}));

import { createStoreJob, updateStoreBlueprint } from "@/lib/stores/repository";

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type StoreStatus = StoreRow["status"];
type StorePayload = Record<string, unknown>;

const storeId = "00000000-0000-4000-8000-000000000123";
const timestamp = "2026-05-19T10:00:00.000Z";

function createStoreRow(overrides: Partial<StoreRow> = {}): StoreRow {
  const blueprint = createMockStoreBlueprint();

  return {
    id: storeId,
    clerk_user_id: "user_123",
    name: blueprint.storeName,
    slug: "test-store-00000000",
    business_idea: "A store idea",
    original_prompt: "A store idea",
    blueprint_json: blueprint as unknown as Json,
    status: "draft",
    product_count: blueprint.products.length,
    source_template_repo: "vercel/commerce",
    generated_repo_owner: null,
    generated_repo_name: null,
    generated_repo_full_name: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function rowFromPayload(payload: StorePayload): StoreRow {
  return createStoreRow({
    id: String(payload.id ?? storeId),
    clerk_user_id: String(payload.clerk_user_id ?? "user_123"),
    name: String(payload.name ?? "Test Store"),
    slug: String(payload.slug ?? "test-store-00000000"),
    business_idea: String(payload.business_idea ?? "A store idea"),
    original_prompt: String(payload.original_prompt ?? "A store idea"),
    blueprint_json: payload.blueprint_json as Json,
    status: (payload.status ?? "draft") as StoreStatus,
    product_count: Number(payload.product_count ?? 1),
    source_template_repo: String(
      payload.source_template_repo ?? "vercel/commerce",
    ),
    created_at: String(payload.created_at ?? timestamp),
    updated_at: String(payload.updated_at ?? timestamp),
  });
}

function createInsertClient({
  error,
}: {
  error?: { message: string };
} = {}) {
  let insertedPayload: StorePayload | null = null;
  const single = vi.fn(async () => ({
    data: insertedPayload ? rowFromPayload(insertedPayload) : null,
    error: error ?? null,
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((payload: StorePayload) => {
    insertedPayload = payload;
    return { select };
  });
  const from = vi.fn(() => ({ insert }));
  const client = { from };

  return {
    client,
    from,
    insert,
    get insertedPayload() {
      return insertedPayload;
    },
  };
}

function createUpdateClient() {
  let updatedPayload: StorePayload | null = null;
  const single = vi.fn(async () => ({
    data: updatedPayload ? rowFromPayload(updatedPayload) : null,
    error: null,
  }));
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn((payload: StorePayload) => {
    updatedPayload = payload;
    return { eq };
  });
  const from = vi.fn(() => ({ update }));
  const client = { from };

  return {
    client,
    from,
    update,
    eq,
    get updatedPayload() {
      return updatedPayload;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  supabaseMock.getSupabaseAdminClient.mockReset();
});

describe("store repository Supabase mapping", () => {
  it("creates a store job with snake_case persistence and camelCase output", async () => {
    const blueprint = {
      ...createMockStoreBlueprint(),
      storeName: "Test Store",
    };
    const insertClient = createInsertClient();
    supabaseMock.getSupabaseAdminClient.mockReturnValue(insertClient.client);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      storeId as `${string}-${string}-${string}-${string}-${string}`,
    );

    const store = await createStoreJob({
      userId: "user_123",
      originalPrompt: "A store idea",
      blueprint,
    });

    expect(insertClient.from).toHaveBeenCalledWith("stores");
    expect(insertClient.insertedPayload).toMatchObject({
      id: storeId,
      clerk_user_id: "user_123",
      name: "Test Store",
      slug: "test-store-00000000",
      business_idea: "A store idea",
      original_prompt: "A store idea",
      blueprint_json: blueprint,
      status: "draft",
      product_count: blueprint.products.length,
      source_template_repo: "vercel/commerce",
    });
    expect(store).toMatchObject({
      id: storeId,
      clerkUserId: "user_123",
      name: "Test Store",
      slug: "test-store-00000000",
      businessIdea: "A store idea",
      originalPrompt: "A store idea",
      status: "draft",
      productCount: blueprint.products.length,
      sourceTemplateRepo: "vercel/commerce",
      generatedRepoOwner: null,
      generatedRepoName: null,
      generatedRepoFullName: null,
    });
  });

  it("updates blueprint fields using Supabase column names", async () => {
    const blueprint = {
      ...createMockStoreBlueprint(),
      storeName: "Updated Brand",
    };
    const updateClient = createUpdateClient();
    supabaseMock.getSupabaseAdminClient.mockReturnValue(updateClient.client);

    const store = await updateStoreBlueprint({
      storeId,
      blueprint,
      status: "generated",
    });

    expect(updateClient.from).toHaveBeenCalledWith("stores");
    expect(updateClient.update).toHaveBeenCalledTimes(1);
    expect(updateClient.eq).toHaveBeenCalledWith("id", storeId);
    expect(updateClient.updatedPayload).toMatchObject({
      name: "Updated Brand",
      slug: "updated-brand-00000000",
      blueprint_json: blueprint,
      product_count: blueprint.products.length,
      status: "generated",
    });
    expect(store).toMatchObject({
      name: "Updated Brand",
      slug: "updated-brand-00000000",
      status: "generated",
      productCount: blueprint.products.length,
    });
  });

  it("surfaces Supabase insert errors clearly", async () => {
    const insertClient = createInsertClient({
      error: { message: "insert denied" },
    });
    supabaseMock.getSupabaseAdminClient.mockReturnValue(insertClient.client);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      storeId as `${string}-${string}-${string}-${string}-${string}`,
    );

    await expect(
      createStoreJob({
        userId: "user_123",
        originalPrompt: "A store idea",
        blueprint: createMockStoreBlueprint(),
      }),
    ).rejects.toThrow("Failed to create store job: insert denied");
  });
});
