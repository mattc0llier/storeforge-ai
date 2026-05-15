import { z } from "zod";

import { StoreBlueprintSchema } from "@/lib/store-generation/store-blueprint";

const TimestampSchema = z.iso.datetime({ offset: true });
const StringArraySchema = z.array(z.string());
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const StoreStatusSchema = z.enum([
  "draft",
  "generating",
  "generated",
  "deploying",
  "deployed",
  "failed",
]);

export const WorkflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

export const DeploymentStatusSchema = z.enum([
  "queued",
  "building",
  "ready",
  "error",
  "canceled",
]);

export const StoreSchema = z.object({
  id: z.uuid(),
  clerkUserId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  businessIdea: z.string().min(1),
  originalPrompt: z.string().min(1),
  blueprint: StoreBlueprintSchema,
  status: StoreStatusSchema,
  productCount: z.number().int().min(1).max(7),
  sourceTemplateRepo: z.string().min(1),
  generatedRepoOwner: z.string().nullable(),
  generatedRepoName: z.string().nullable(),
  generatedRepoFullName: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const WorkflowRunSchema = z.object({
  id: z.uuid(),
  storeId: z.uuid(),
  workflowName: z.string().min(1),
  providerRunId: z.string().nullable(),
  status: WorkflowRunStatusSchema,
  currentStep: z.string().nullable(),
  repairCount: z.number().int().min(0),
  logsSummary: StringArraySchema,
  modifiedFilesSummary: StringArraySchema,
  codexActivitySummary: StringArraySchema,
  workspacePath: z.string().nullable(),
  artifactMetadata: JsonObjectSchema,
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
  errorMessage: z.string().nullable(),
});

export const DeploymentMetadataSchema = z.object({
  id: z.uuid(),
  storeId: z.uuid(),
  vercelProjectId: z.string().nullable(),
  vercelDeploymentId: z.string().nullable(),
  deploymentUrl: z.url().nullable(),
  previewUrl: z.url().nullable(),
  productionUrl: z.url().nullable(),
  environment: z.enum(["preview", "production"]),
  status: DeploymentStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type StoreStatus = z.infer<typeof StoreStatusSchema>;
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type DeploymentMetadata = z.infer<typeof DeploymentMetadataSchema>;
