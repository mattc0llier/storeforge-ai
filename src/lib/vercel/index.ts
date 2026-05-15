export interface VercelDeploymentInput {
  storeId: string;
  repositoryFullName: string;
  production?: boolean;
}

export interface VercelDeploymentResult {
  projectId: string;
  deploymentId: string;
  url: string;
}

export async function deployGeneratedStore(
  input: VercelDeploymentInput,
): Promise<VercelDeploymentResult> {
  void input;
  // TODO: Create or update Vercel projects and trigger deployments.
  throw new Error("Vercel deployment automation is not implemented yet.");
}
