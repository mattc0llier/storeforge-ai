export interface CodexRepositoryTransformInput {
  storeId: string;
  sourceRepository: string;
  targetRepository: string;
  prompt: string;
}

export interface CodexRepositoryTransformResult {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed";
}

export async function startRepositoryTransformation(
  input: CodexRepositoryTransformInput,
): Promise<CodexRepositoryTransformResult> {
  void input;
  // TODO: Wire this to the Codex TypeScript SDK repository execution API.
  throw new Error("Codex repository transformation is not implemented yet.");
}
