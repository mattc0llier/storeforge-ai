import { Sandbox } from "@vercel/sandbox";

import { buildCommerceTransformPrompt } from "../../../prompts/codex-transform";
import { getStoreJob } from "../stores/repository";
import {
  createWorkflowEvent,
  updateStoreStatus,
  updateWorkflowRun,
} from "../stores/workflow-runs";
import type { StoreGenerationRunInput, StoreGenerationRunResult } from "./generation-types";
import { buildSandboxJobScript } from "./sandbox-job-script";
import {
  compactEnv,
  getSandboxCredentials,
  getSandboxJobEnvironment,
  getSandboxSource,
  getSandboxSourceLabel,
  SANDBOX_BLUEPRINT_PATH,
  SANDBOX_JOB_PATH,
  SANDBOX_PREVIEW_PORT,
  SANDBOX_PRODUCT_ASSETS_PATH,
  SANDBOX_TRANSFORM_PROMPT_PATH,
  SANDBOX_WORKSPACE_PATH,
  shouldEnableLivePreview,
} from "./sandbox-runtime";

export async function startSandboxStoreGeneration(
  input: StoreGenerationRunInput,
): Promise<StoreGenerationRunResult> {
  try {
    console.log(`[generate-store] sandbox START store=${input.storeId}`);
    await emitWorkflowEvent(
      input,
      "workspace",
      "running",
      "Starting Vercel Sandbox",
    );
    await updateStoreStatus(input.storeId, "generating");
    await updateWorkflowRun(input.workflowRunId, {
      status: "running",
      currentStep: "workspace",
      logsSummary: ["Starting Vercel Sandbox generation runtime"],
    });

    const store = await getStoreJob(input.storeId);

    if (!store) {
      throw new Error(`Store ${input.storeId} not found`);
    }

    const productAssets = store.blueprint.products.map((product) => ({
      productId: product.id,
      title: product.title,
      imageUrl: product.imageUrl,
      source: "blueprint-placeholder" as const,
    }));

    const livePreviewEnabled = shouldEnableLivePreview();
    const sandbox = await Sandbox.create({
      ...getSandboxCredentials(),
      source: getSandboxSource(),
      runtime: "node24",
      resources: { vcpus: 4 },
      timeout: Number(process.env.STOREFORGE_SANDBOX_TIMEOUT_MS ?? 2700000),
      env: getSandboxJobEnvironment(input),
      ports: livePreviewEnabled ? [SANDBOX_PREVIEW_PORT] : undefined,
    } as Parameters<typeof Sandbox.create>[0]);
    const previewUrl = livePreviewEnabled
      ? sandbox.domain(SANDBOX_PREVIEW_PORT)
      : null;

    const transformPrompt = buildCommerceTransformPrompt({
      blueprint: store.blueprint,
    });
    await sandbox.writeFiles([
      {
        path: SANDBOX_TRANSFORM_PROMPT_PATH,
        content: transformPrompt,
      },
      {
        path: SANDBOX_BLUEPRINT_PATH,
        content: JSON.stringify(store.blueprint, null, 2),
      },
      {
        path: SANDBOX_PRODUCT_ASSETS_PATH,
        content: JSON.stringify(productAssets, null, 2),
      },
      {
        path: SANDBOX_JOB_PATH,
        content: buildSandboxJobScript(),
      },
    ]);
    const syntaxCheck = await sandbox.runCommand({
      cmd: "node",
      args: ["--check", SANDBOX_JOB_PATH],
      cwd: SANDBOX_WORKSPACE_PATH,
    });

    if (syntaxCheck.exitCode !== 0) {
      const stderr = await syntaxCheck.stderr();
      const stdout = await syntaxCheck.stdout();

      throw new Error(
        [
          "Generated sandbox job failed syntax validation",
          stdout.trim() ? `stdout:\n${stdout}` : "",
          stderr.trim() ? `stderr:\n${stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }

    const command = await sandbox.runCommand({
      cmd: "node",
      args: [SANDBOX_JOB_PATH],
      cwd: SANDBOX_WORKSPACE_PATH,
      detached: true,
      env: compactEnv({
        STOREFORGE_LIVE_PREVIEW_ENABLED: livePreviewEnabled ? "true" : "false",
        STOREFORGE_PREVIEW_PORT: String(SANDBOX_PREVIEW_PORT),
        STOREFORGE_PREVIEW_URL: previewUrl ?? undefined,
      }),
    });

    const sandboxPath = SANDBOX_WORKSPACE_PATH;
    await updateWorkflowRun(input.workflowRunId, {
      providerRunId: `${input.workflowRunId}:${sandbox.sandboxId}:${command.cmdId}`,
      workspacePath: sandboxPath,
      logsSummary: [
        `Vercel Sandbox ${sandbox.sandboxId} started`,
        `Detached command ${command.cmdId} started`,
      ],
      artifactMetadata: {
        sandboxId: sandbox.sandboxId,
        sandboxCommandId: command.cmdId,
        sandboxSource: getSandboxSourceLabel(),
        workspacePath: sandboxPath,
        previewUrl,
        previewPort: livePreviewEnabled ? SANDBOX_PREVIEW_PORT : null,
        previewStatus: livePreviewEnabled ? "queued" : "disabled",
        productAssets,
        heroImagePrompt: store.blueprint.heroImagePrompt,
      },
    });

    await emitWorkflowEvent(
      input,
      "workspace",
      "succeeded",
      `Vercel Sandbox ${sandbox.sandboxId} started`,
    );
    console.log(
      `[generate-store] sandbox STARTED sandbox=${sandbox.sandboxId}`,
    );

    return {
      success: true,
      workspacePath: sandboxPath,
      repairAttemptsUsed: 0,
      modifiedFiles: [],
      modifiedFilesSummary: [],
      buildResult: "passed",
    };
  } catch (error) {
    await markWorkflowFailed(input, formatUnknownError(error));
    throw error;
  }
}


async function markWorkflowFailed(
  input: StoreGenerationRunInput,
  message: string,
) {
  console.error(`[generate-store] FAILED ${message}`);
  await updateWorkflowRun(input.workflowRunId, {
    status: "failed",
    currentStep: "failed",
    completedAt: new Date().toISOString(),
    errorMessage: message,
  });
  await updateStoreStatus(input.storeId, "failed");
  await emitWorkflowEvent(input, "failed", "failed", message);
}

async function emitWorkflowEvent(
  input: StoreGenerationRunInput,
  step: string,
  status: "running" | "succeeded" | "failed",
  message: string,
  attributes: Record<string, unknown> = {},
) {
  console.log(`[generate-store] ${step} ${status}: ${message}`);
  await createWorkflowEvent({
    workflowRunId: input.workflowRunId,
    storeId: input.storeId,
    eventName: `storeforge.${step}.${status}`,
    step,
    status,
    message,
    attributes,
  }).catch((error: unknown) => {
    console.warn("[workflow-events] failed to record event", error);
  });
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return "Unknown workflow failure";
}
