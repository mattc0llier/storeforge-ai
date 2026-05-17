export interface VercelDeploymentInput {
  storeId: string;
  repositoryFullName: string;
  repositoryId: number;
  projectName: string;
  production?: boolean;
}

export interface VercelProjectResult {
  id: string;
  name: string;
  url: string;
}

export interface VercelDeploymentResult {
  projectId: string;
  deploymentId: string;
  deploymentUrl: string;
  productionUrl: string | null;
  status: "building" | "ready" | "error" | "canceled";
}

type VercelProjectResponse = {
  id: string;
  name: string;
};

type VercelDeploymentResponse = {
  id?: string;
  uid?: string;
  url?: string;
  alias?: string[];
  readyState?: string;
  ready_state?: string;
};

export async function createLinkedVercelProject({
  projectName,
  repositoryFullName,
}: Pick<VercelDeploymentInput, "projectName" | "repositoryFullName">) {
  const token = requireEnv("VERCEL_TOKEN");
  const response = await fetch(
    withVercelTeam("https://api.vercel.com/v11/projects"),
    {
      method: "POST",
      headers: getVercelHeaders(token),
      body: JSON.stringify({
        name: projectName,
        framework: "nextjs",
        gitRepository: {
          type: "github",
          repo: repositoryFullName,
        },
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create Vercel project: ${response.status} ${await response.text()}`,
    );
  }

  const project = (await response.json()) as VercelProjectResponse;

  return {
    id: project.id,
    name: project.name,
    url: `https://vercel.com/${project.name}`,
  } satisfies VercelProjectResult;
}

export async function deployGeneratedStore(
  input: VercelDeploymentInput,
): Promise<VercelDeploymentResult> {
  const token = requireEnv("VERCEL_TOKEN");
  const project = await createLinkedVercelProject(input);
  const deployment = await createGitDeployment({
    token,
    projectId: project.id,
    projectName: project.name,
    repositoryId: input.repositoryId,
    production: input.production ?? true,
    storeId: input.storeId,
  });
  const readyDeployment = await waitForVercelDeployment({
    token,
    deployment,
  });
  const status = mapReadyState(
    readyDeployment.readyState ?? readyDeployment.ready_state,
  );
  const deploymentUrl = getDeploymentUrl(readyDeployment) ?? "";

  return {
    projectId: project.id,
    deploymentId: readyDeployment.id ?? readyDeployment.uid ?? "",
    deploymentUrl,
    productionUrl: status === "ready" ? deploymentUrl : null,
    status,
  };
}

async function createGitDeployment({
  token,
  projectId,
  projectName,
  repositoryId,
  production,
  storeId,
}: {
  token: string;
  projectId: string;
  projectName: string;
  repositoryId: number;
  production: boolean;
  storeId: string;
}) {
  const response = await fetch(
    withVercelTeam(
      "https://api.vercel.com/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1",
    ),
    {
      method: "POST",
      headers: getVercelHeaders(token),
      body: JSON.stringify({
        name: projectName,
        project: projectId,
        target: production ? "production" : undefined,
        gitSource: {
          type: "github",
          repoId: repositoryId,
          ref: "main",
        },
        meta: {
          storeforgeStoreId: storeId,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create Vercel deployment: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as VercelDeploymentResponse;
}

async function waitForVercelDeployment({
  token,
  deployment,
}: {
  token: string;
  deployment: VercelDeploymentResponse;
}) {
  let latest = deployment;
  const deploymentId = deployment.id ?? deployment.uid;

  if (!deploymentId) {
    return latest;
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = latest.readyState ?? latest.ready_state;

    if (state === "READY" || state === "ERROR" || state === "CANCELED") {
      return latest;
    }

    await sleep(3000);

    const response = await fetch(
      withVercelTeam(`https://api.vercel.com/v13/deployments/${deploymentId}`),
      { headers: getVercelHeaders(token) },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to poll Vercel deployment: ${response.status} ${await response.text()}`,
      );
    }

    latest = (await response.json()) as VercelDeploymentResponse;
  }

  return latest;
}

function getDeploymentUrl(deployment: VercelDeploymentResponse) {
  const url = deployment.alias?.[0] ?? deployment.url;

  if (!url) {
    return null;
  }

  return url.startsWith("http") ? url : `https://${url}`;
}

function mapReadyState(state: string | undefined): VercelDeploymentResult["status"] {
  if (state === "READY") {
    return "ready";
  }

  if (state === "ERROR") {
    return "error";
  }

  if (state === "CANCELED") {
    return "canceled";
  }

  return "building";
}

function getVercelHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function withVercelTeam(url: string) {
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!teamId) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}teamId=${encodeURIComponent(teamId)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
