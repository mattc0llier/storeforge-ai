export type GitHubOwnerType = "user" | "org";
export type GitHubRepositoryVisibility = "private" | "public";

export interface GeneratedRepositoryInput {
  storeId: string;
  name: string;
  owner?: string;
  ownerType?: GitHubOwnerType;
  visibility?: GitHubRepositoryVisibility;
}

export interface GeneratedRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  repoId: number;
}

type GitHubRepositoryResponse = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  owner?: {
    login?: string;
  };
};

export async function createGeneratedStoreRepository({
  storeId,
  name,
  owner = requireEnv("STOREFORGE_GITHUB_OWNER"),
  ownerType = getOwnerType(),
  visibility = getVisibility(),
}: GeneratedRepositoryInput): Promise<GeneratedRepository> {
  const token = requireEnv("GITHUB_TOKEN");
  const repoName = buildGeneratedRepositoryName(name, storeId);
  const response = await fetch(getRepositoryCreateUrl(owner, ownerType), {
    method: "POST",
    headers: getGitHubHeaders(token),
    body: JSON.stringify({
      name: repoName,
      private: visibility !== "public",
      auto_init: false,
      description: `Generated StoreForge Commerce storefront for ${name}`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create GitHub repository: ${response.status} ${await response.text()}`,
    );
  }

  const repository = (await response.json()) as GitHubRepositoryResponse;

  return {
    owner: repository.owner?.login ?? owner,
    name: repository.name,
    fullName: repository.full_name,
    url: repository.html_url,
    repoId: repository.id,
  };
}

export function buildGeneratedRepositoryName(name: string, storeId: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);

  return `storeforge-${slug || "store"}-${storeId.slice(0, 8)}`;
}

export function buildAuthenticatedGitRemoteUrl({
  owner,
  repoName,
  token = requireEnv("GITHUB_TOKEN"),
}: {
  owner: string;
  repoName: string;
  token?: string;
}) {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repoName}.git`;
}

function getRepositoryCreateUrl(owner: string, ownerType: GitHubOwnerType) {
  return ownerType === "org"
    ? `https://api.github.com/orgs/${owner}/repos`
    : "https://api.github.com/user/repos";
}

function getGitHubHeaders(token: string) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "storeforge-ai",
  };
}

function getOwnerType(): GitHubOwnerType {
  return process.env.STOREFORGE_GITHUB_OWNER_TYPE === "org" ? "org" : "user";
}

function getVisibility(): GitHubRepositoryVisibility {
  return process.env.STOREFORGE_GITHUB_REPO_VISIBILITY === "public"
    ? "public"
    : "private";
}

function requireEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
