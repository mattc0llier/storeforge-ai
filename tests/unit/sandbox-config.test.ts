import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCommerceTransformPrompt } from "../../prompts/codex-transform";
import {
  buildGeneratedStoreRepositoryName,
  getGeneratedStorePublishingConfig,
} from "@/lib/store-generation/publishing-config";
import {
  compactEnv,
  getSandboxJobEnvironment,
  getSandboxSource,
  shouldEnableLivePreview,
} from "@/lib/store-generation/sandbox-runtime";
import { buildSandboxJobScript } from "@/lib/store-generation/sandbox-job-script";
import { createMockStoreBlueprint } from "@/lib/store-generation/store-blueprint";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sandbox runtime configuration", () => {
  it("compacts environment variables before passing them to sandbox commands", () => {
    expect(
      compactEnv({
        CODEX_API_KEY: "codex-key",
        EMPTY: "",
        MISSING: undefined,
        ZERO: "0",
      }),
    ).toEqual({
      CODEX_API_KEY: "codex-key",
      ZERO: "0",
    });
  });

  it("prefers a sandbox snapshot source when configured", () => {
    vi.stubEnv("STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID", "snap_123");

    expect(getSandboxSource()).toEqual({
      type: "snapshot",
      snapshotId: "snap_123",
    });
  });

  it("falls back to a git Commerce source when no snapshot is configured", () => {
    vi.stubEnv("STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID", "");

    const source = getSandboxSource();

    expect(source).toMatchObject({
      type: "git",
      depth: 1,
    });
  });

  it("builds a controlled sandbox job environment", () => {
    vi.stubEnv("CODEX_API_KEY", "codex-key");
    vi.stubEnv("STOREFORGE_DEPLOYMENT_ENABLED", "true");
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("STOREFORGE_GITHUB_OWNER", "mattc0llier");
    vi.stubEnv("STOREFORGE_GITHUB_OWNER_TYPE", "user");
    vi.stubEnv("STOREFORGE_GITHUB_REPO_VISIBILITY", "public");
    vi.stubEnv("VERCEL_TOKEN", "vercel-token");
    vi.stubEnv("VERCEL_TEAM_ID", "team_123");

    const environment = getSandboxJobEnvironment({
      storeId: "store_123",
      workflowRunId: "run_123",
    });

    expect(environment).toMatchObject({
      STORE_ID: "store_123",
      WORKFLOW_RUN_ID: "run_123",
      CODEX_API_KEY: "codex-key",
      OPENAI_API_KEY: "codex-key",
      STOREFORGE_DEPLOYMENT_ENABLED: "true",
      GITHUB_TOKEN: "gh-token",
      STOREFORGE_GITHUB_OWNER: "mattc0llier",
      STOREFORGE_GITHUB_OWNER_TYPE: "user",
      STOREFORGE_GITHUB_REPO_VISIBILITY: "public",
      VERCEL_TOKEN: "vercel-token",
      VERCEL_TEAM_ID: "team_123",
      CODEX_CLI_PACKAGE: "@openai/codex@0.130.0",
      PNPM_VERSION: "10.33.0",
    });
  });

  it("keeps live preview enabled by default unless explicitly disabled", () => {
    vi.stubEnv("STOREFORGE_LIVE_PREVIEW_ENABLED", "");
    expect(shouldEnableLivePreview()).toBe(true);

    vi.stubEnv("STOREFORGE_LIVE_PREVIEW_ENABLED", "false");
    expect(shouldEnableLivePreview()).toBe(false);
  });
});

describe("publishing configuration", () => {
  it("normalizes generated repository names", () => {
    expect(
      buildGeneratedStoreRepositoryName(
        "HydraBoost Essentials!!",
        "abcdef12-3456-7890-abcd-ef1234567890",
      ),
    ).toBe("storeforge-hydraboost-essentials-abcdef12");
  });

  it("parses deployment and repository publishing env", () => {
    vi.stubEnv("STOREFORGE_DEPLOYMENT_ENABLED", "true");
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("STOREFORGE_GITHUB_OWNER", "mattc0llier");
    vi.stubEnv("STOREFORGE_GITHUB_OWNER_TYPE", "user");
    vi.stubEnv("STOREFORGE_GITHUB_REPO_VISIBILITY", "private");
    vi.stubEnv("VERCEL_TOKEN", "vercel-token");

    expect(getGeneratedStorePublishingConfig()).toMatchObject({
      deploymentEnabled: true,
      githubToken: "gh-token",
      githubOwner: "mattc0llier",
      githubOwnerType: "user",
      githubRepositoryVisibility: "private",
      vercelToken: "vercel-token",
    });
  });
});

describe("Codex transformation prompt", () => {
  it("contains bounded autonomy, asset, and responsive layout guardrails", () => {
    const blueprint = createMockStoreBlueprint();
    const prompt = buildCommerceTransformPrompt({
      blueprint: {
        ...blueprint,
        products: blueprint.products.map((product) => ({
          ...product,
          imageUrl: `https://pnfjajqha7vht6gv.public.blob.vercel-storage.com/${product.handle}.webp`,
        })),
      },
    });

    expect(prompt).toContain("StoreBlueprint:");
    expect(prompt).toContain(blueprint.storeName);
    expect(prompt).toContain("Use StoreBlueprint.products[].imageUrl exactly");
    expect(prompt).toContain("*.public.blob.vercel-storage.com");
    expect(prompt).toMatch(/do not use web search/i);
    expect(prompt).toContain(
      "Preserve the base Commerce responsive navigation behavior",
    );
    expect(prompt).toContain("components/cart/actions.ts");
  });
});

describe("sandbox job script contract", () => {
  it("contains the repair loop, preview, and publishing stages", () => {
    const script = buildSandboxJobScript();

    expect(script).toContain("const MAX_REPAIR_ATTEMPTS = 2");
    expect(script).toContain("async function runCodex");
    expect(script).toContain("async function publishGeneratedStore");
    expect(script).toContain("STOREFORGE_DEPLOYMENT_ENABLED");
    expect(script).toContain("STOREFORGE_LIVE_PREVIEW_ENABLED");
  });
});
