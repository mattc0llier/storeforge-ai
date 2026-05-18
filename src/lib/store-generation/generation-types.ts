export type StoreGenerationRunInput = {
  storeId: string;
  workflowRunId: string;
};

export type StoreGenerationRunResult = {
  success: boolean;
  workspacePath: string;
  repairAttemptsUsed: number;
  modifiedFiles: string[];
  modifiedFilesSummary: string[];
  buildResult: "passed" | "failed";
};
