import { getGeneratedStorePublishingConfig } from "./publishing-config";

export const SANDBOX_WORKSPACE_PATH = "/vercel/sandbox";
export const SANDBOX_TRANSFORM_PROMPT_PATH = "/tmp/storeforge-transform-prompt.txt";
export const SANDBOX_BLUEPRINT_PATH = "/tmp/storeforge-blueprint.json";
export const SANDBOX_PRODUCT_ASSETS_PATH = "/tmp/storeforge-product-assets.json";
export const SANDBOX_JOB_PATH = "/tmp/storeforge-sandbox-job.mjs";
export const SANDBOX_PREVIEW_PORT = Number(
  process.env.STOREFORGE_LIVE_PREVIEW_PORT ?? 3000,
);

const COMMERCE_REPO_URL =
  process.env.STOREFORGE_COMMERCE_REPO_URL ??
  "https://github.com/vercel/commerce.git";

type SandboxGenerationInput = {
  storeId: string;
  workflowRunId: string;
};

export function shouldUseSandboxGeneration() {
  const runtime = process.env.STOREFORGE_GENERATION_RUNTIME;

  if (runtime === "local") {
    return false;
  }

  if (runtime === "sandbox") {
    return true;
  }

  return process.env.VERCEL === "1";
}

export function shouldEnableLivePreview() {
  return process.env.STOREFORGE_LIVE_PREVIEW_ENABLED !== "false";
}

export function getSandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_ORG_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }

  return {};
}

export function getSandboxSource() {
  const snapshotId = process.env.STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID;

  if (snapshotId) {
    return {
      type: "snapshot" as const,
      snapshotId,
    };
  }

  return {
    type: "git" as const,
    url: COMMERCE_REPO_URL,
    depth: 1,
  };
}

export function getSandboxSourceLabel() {
  const snapshotId = process.env.STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID;

  return snapshotId ? `snapshot:${snapshotId}` : `git:${COMMERCE_REPO_URL}`;
}

export function getSandboxJobEnvironment(input: SandboxGenerationInput) {
  const publishingConfig = getGeneratedStorePublishingConfig();

  return compactEnv({
    STORE_ID: input.storeId,
    WORKFLOW_RUN_ID: input.workflowRunId,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    VERCEL: process.env.VERCEL,
    CODEX_API_KEY: process.env.CODEX_API_KEY,
    OPENAI_API_KEY: process.env.CODEX_API_KEY,
    CODEX_BASE_URL: process.env.CODEX_BASE_URL,
    CODEX_MODEL: process.env.CODEX_MODEL,
    CODEX_CLI_PACKAGE: process.env.CODEX_CLI_PACKAGE ?? "@openai/codex@0.130.0",
    CODEX_SANDBOX_MODE: process.env.CODEX_SANDBOX_MODE ?? "danger-full-access",
    GITHUB_TOKEN: publishingConfig.githubToken,
    STOREFORGE_GITHUB_OWNER: publishingConfig.githubOwner,
    STOREFORGE_GITHUB_OWNER_TYPE: publishingConfig.githubOwnerType,
    STOREFORGE_GITHUB_REPO_VISIBILITY:
      publishingConfig.githubRepositoryVisibility,
    STOREFORGE_DEPLOYMENT_ENABLED: publishingConfig.deploymentEnabled
      ? "true"
      : undefined,
    VERCEL_TOKEN: publishingConfig.vercelToken,
    VERCEL_TEAM_ID: publishingConfig.vercelTeamId,
    PNPM_VERSION: "10.33.0",
  });
}

export function compactEnv(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
}
