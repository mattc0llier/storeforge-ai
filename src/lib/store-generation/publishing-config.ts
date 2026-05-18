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
  return {
    deploymentEnabled: process.env.STOREFORGE_DEPLOYMENT_ENABLED === "true",
    githubOwner: process.env.STOREFORGE_GITHUB_OWNER,
    githubOwnerType:
      process.env.STOREFORGE_GITHUB_OWNER_TYPE === "org" ? "org" : "user",
    githubRepositoryVisibility:
      process.env.STOREFORGE_GITHUB_REPO_VISIBILITY === "public"
        ? "public"
        : "private",
    githubToken: process.env.GITHUB_TOKEN,
    vercelTeamId: process.env.VERCEL_TEAM_ID,
    vercelToken: process.env.VERCEL_TOKEN,
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
