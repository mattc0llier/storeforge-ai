export type GeneratedStoreOwnerType = "user" | "org";
export type GeneratedStoreRepositoryVisibility = "private" | "public";

export type GeneratedStorePublishingConfig = {
  deploymentEnabled: boolean;
  githubOwner?: string;
  githubOwnerType: GeneratedStoreOwnerType;
  githubRepositoryVisibility: GeneratedStoreRepositoryVisibility;
  githubToken?: string;
  vercelTeamId?: string;
  vercelToken?: string;
};

export function getGeneratedStorePublishingConfig(): GeneratedStorePublishingConfig {
  const ownerType = getOptionalEnv("STOREFORGE_GITHUB_OWNER_TYPE");
  const visibility = getOptionalEnv("STOREFORGE_GITHUB_REPO_VISIBILITY");

  return {
    deploymentEnabled:
      getOptionalEnv("STOREFORGE_DEPLOYMENT_ENABLED") === "true",
    githubOwner: getOptionalEnv("STOREFORGE_GITHUB_OWNER"),
    githubOwnerType: ownerType === "org" ? "org" : "user",
    githubRepositoryVisibility: visibility === "public" ? "public" : "private",
    githubToken: getOptionalEnv("GITHUB_TOKEN"),
    vercelTeamId: getOptionalEnv("VERCEL_TEAM_ID"),
    vercelToken: getOptionalEnv("VERCEL_TOKEN"),
  };
}

export function requireGeneratedStorePublishingConfig() {
  const config = getGeneratedStorePublishingConfig();

  if (!config.githubToken) {
    throw new Error("Missing required environment variable: GITHUB_TOKEN");
  }

  if (!config.githubOwner) {
    throw new Error(
      "Missing required environment variable: STOREFORGE_GITHUB_OWNER",
    );
  }

  if (!config.vercelToken) {
    throw new Error("Missing required environment variable: VERCEL_TOKEN");
  }

  return {
    ...config,
    githubOwner: config.githubOwner,
    githubToken: config.githubToken,
    vercelToken: config.vercelToken,
  };
}

export function buildGeneratedStoreRepositoryName(name: string, storeId: string) {
  const slug = slugifyGeneratedStoreName(name).slice(0, 70);

  return `storeforge-${slug || "store"}-${storeId.slice(0, 8)}`;
}

export function slugifyGeneratedStoreName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getOptionalEnv(key: string) {
  const value = process.env[key]?.trim();

  return value ? value : undefined;
}
