import {
  buildGeneratedStoreRepositoryName,
  getGeneratedStorePublishingConfig,
  type GeneratedStoreOwnerType,
  type GeneratedStoreRepositoryVisibility,
} from "@/lib/store-generation/publishing-config";

export type GitHubOwnerType = GeneratedStoreOwnerType;
export type GitHubRepositoryVisibility = GeneratedStoreRepositoryVisibility;

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
  owner = requireGitHubOwner(),
  ownerType = getOwnerType(),
  visibility = getVisibility(),
}: GeneratedRepositoryInput): Promise<GeneratedRepository> {
  const token = requireGitHubToken();
  const repoName = buildGeneratedStoreRepositoryName(name, storeId);
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
  return buildGeneratedStoreRepositoryName(name, storeId);
}

export function buildAuthenticatedGitRemoteUrl({
  owner,
  repoName,
  token = requireGitHubToken(),
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
  return getGeneratedStorePublishingConfig().githubOwnerType;
}

function getVisibility(): GitHubRepositoryVisibility {
  return getGeneratedStorePublishingConfig().githubRepositoryVisibility;
}

function requireGitHubOwner() {
  const owner = getGeneratedStorePublishingConfig().githubOwner;

  if (!owner) {
    throw new Error(
      "Missing required environment variable: STOREFORGE_GITHUB_OWNER",
    );
  }

  return owner;
}

function requireGitHubToken() {
  const token = getGeneratedStorePublishingConfig().githubToken;

  if (!token) {
    throw new Error("Missing required environment variable: GITHUB_TOKEN");
  }

  return token;
}
