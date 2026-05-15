import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getWritable } from "workflow";
import type { ThreadEvent } from "@openai/codex-sdk";

import {
  createStoreForgeCodexClient,
  logCodexEvent,
  startWorkspaceThread,
} from "../lib/codex/client";
import {
  buildCommerceRepairPrompt,
  buildCommerceTransformPrompt,
} from "../prompts/codex-transform";
import { getStoreJob } from "../src/lib/stores/repository";
import {
  updateStoreStatus,
  updateWorkflowRun,
} from "../src/lib/stores/workflow-runs";

const MAX_REPAIR_ATTEMPTS = 2;
const PNPM = "npx --yes pnpm@10.33.0";

export type GenerateStoreWorkflowInput = {
  storeId: string;
  workflowRunId: string;
};

export type GenerateStoreWorkflowEvent = {
  type: "progress";
  step: string;
  status: "running" | "succeeded" | "failed";
  message: string;
};

export type GenerateStoreWorkflowResult = {
  success: boolean;
  workspacePath: string;
  repairAttemptsUsed: number;
  modifiedFiles: string[];
  modifiedFilesSummary: string[];
  buildResult: "passed" | "failed";
};

type PreparedWorkspace = {
  root: string;
  workspacePath: string;
  installLogSummary: string;
};

type ProductAssetMetadata = {
  productId: string;
  title: string;
  imageUrl: string;
  source: "blueprint-placeholder";
}[];

type CommandResult = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

type VerificationResult = {
  ok: boolean;
  failedCommand: CommandResult | null;
  commands: CommandResult[];
};

export async function generateStoreWorkflow(
  input: GenerateStoreWorkflowInput,
): Promise<GenerateStoreWorkflowResult> {
  "use workflow";

  try {
    const preparedWorkspace = await prepareWorkspace(input);
    const productAssets = await generateProductAssets(input);
    await executeCodexTransformation(input, preparedWorkspace.workspacePath);
    const validation = await validateAndRepairWorkspace(
      input,
      preparedWorkspace.workspacePath,
    );

    return await persistGeneratedArtifactMetadata({
      input,
      preparedWorkspace,
      productAssets,
      validation,
    });
  } catch (error) {
    await markWorkflowFailed(
      input,
      error instanceof Error ? error.message : "Unknown workflow failure",
    );
    throw error;
  }
}

async function prepareWorkspace(
  input: GenerateStoreWorkflowInput,
): Promise<PreparedWorkspace> {
  "use step";

  console.log(`[generate-store] prepareWorkspace START store=${input.storeId}`);
  await emitProgress("workspace", "running", "Preparing Commerce workspace");
  await updateStoreStatus(input.storeId, "generating");
  await updateWorkflowRun(input.workflowRunId, {
    status: "running",
    currentStep: "workspace",
  });

  const root = await mkdtemp(path.join(os.tmpdir(), "storeforge-commerce-"));
  const workspacePath = path.join(root, "commerce");

  await runRequiredCommand(
    "git clone --depth 1 https://github.com/vercel/commerce commerce",
    {
      cwd: root,
      timeoutMs: 120000,
    },
  );

  const install = await runRequiredCommand(`${PNPM} install --frozen-lockfile`, {
    cwd: workspacePath,
    timeoutMs: 600000,
  });

  const installLogSummary = summarizeCommand(install);
  await updateWorkflowRun(input.workflowRunId, {
    workspacePath,
    logsSummary: [installLogSummary],
  });
  await emitProgress("workspace", "succeeded", "Workspace prepared");
  console.log(`[generate-store] prepareWorkspace DONE workspace=${workspacePath}`);

  return {
    root,
    workspacePath,
    installLogSummary,
  };
}

async function generateProductAssets(
  input: GenerateStoreWorkflowInput,
): Promise<ProductAssetMetadata> {
  "use step";

  console.log(`[generate-store] generateProductAssets START store=${input.storeId}`);
  await emitProgress("products", "running", "Generating product placeholders");
  await updateWorkflowRun(input.workflowRunId, {
    currentStep: "products",
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

  await updateWorkflowRun(input.workflowRunId, {
    artifactMetadata: {
      productAssets,
      heroImagePrompt: store.blueprint.heroImagePrompt,
    },
  });
  await emitProgress("products", "succeeded", "Product metadata prepared");
  console.log(`[generate-store] generateProductAssets DONE count=${productAssets.length}`);

  return productAssets;
}

async function executeCodexTransformation(
  input: GenerateStoreWorkflowInput,
  workspacePath: string,
) {
  "use step";

  console.log(`[generate-store] executeCodexTransformation START store=${input.storeId}`);
  await emitProgress("codex", "running", "Codex transforming storefront");
  await updateWorkflowRun(input.workflowRunId, {
    currentStep: "codex",
  });

  const store = await getStoreJob(input.storeId);

  if (!store) {
    throw new Error(`Store ${input.storeId} not found`);
  }

  const activity = await runCodexTurnWithStreaming({
    workspacePath,
    prompt: buildCommerceTransformPrompt({ blueprint: store.blueprint }),
    label: "transform",
  });

  await updateWorkflowRun(input.workflowRunId, {
    codexActivitySummary: summarizeLines(activity),
  });
  await emitProgress("codex", "succeeded", "Codex transformation complete");
  console.log("[generate-store] executeCodexTransformation DONE");
}

async function validateAndRepairWorkspace(
  input: GenerateStoreWorkflowInput,
  workspacePath: string,
) {
  "use step";

  console.log(`[generate-store] validateAndRepairWorkspace START store=${input.storeId}`);
  await emitProgress("build", "running", "Running build and test validation");
  await updateWorkflowRun(input.workflowRunId, {
    currentStep: "build",
  });

  const store = await getStoreJob(input.storeId);

  if (!store) {
    throw new Error(`Store ${input.storeId} not found`);
  }

  let repairAttemptsUsed = 0;
  let verification = await verifyCommerceWorkspace(
    workspacePath,
    store.blueprint.storeName,
  );
  const logsSummary = verification.commands.map(summarizeCommand);
  const codexActivity: string[] = [];

  while (!verification.ok && repairAttemptsUsed < MAX_REPAIR_ATTEMPTS) {
    repairAttemptsUsed += 1;
    const failedCommand = verification.failedCommand;

    if (!failedCommand) {
      break;
    }

    await emitProgress(
      "repair",
      "running",
      `Repairing build issues (${repairAttemptsUsed}/${MAX_REPAIR_ATTEMPTS})`,
    );
    await updateWorkflowRun(input.workflowRunId, {
      currentStep: "repair",
      repairCount: repairAttemptsUsed,
      logsSummary: summarizeLines(logsSummary),
    });

    const modifiedFiles = await getModifiedFiles(workspacePath);
    const repairActivity = await runCodexTurnWithStreaming({
      workspacePath,
      label: `repair-${repairAttemptsUsed}`,
      prompt: buildCommerceRepairPrompt({
        attempt: repairAttemptsUsed,
        maxAttempts: MAX_REPAIR_ATTEMPTS,
        command: failedCommand.command,
        exitCode: failedCommand.exitCode,
        stdout: failedCommand.stdout,
        stderr: failedCommand.stderr,
        modifiedFiles,
      }),
    });
    codexActivity.push(...repairActivity);

    verification = await verifyCommerceWorkspace(
      workspacePath,
      store.blueprint.storeName,
    );
    logsSummary.push(...verification.commands.map(summarizeCommand));
  }

  const modifiedFiles = await getModifiedFiles(workspacePath);
  const modifiedFilesSummary = await getModifiedFileSummary(workspacePath);

  await updateWorkflowRun(input.workflowRunId, {
    currentStep: verification.ok ? "preparing_deployment" : "failed",
    repairCount: repairAttemptsUsed,
    logsSummary: summarizeLines(logsSummary),
    modifiedFilesSummary,
    codexActivitySummary: summarizeLines(codexActivity),
    artifactMetadata: {
      buildResult: verification.ok ? "passed" : "failed",
      commandResults: verification.commands.map((command) => ({
        command: command.command,
        exitCode: command.exitCode,
        durationMs: command.durationMs,
      })),
      modifiedFiles,
    },
  });

  if (!verification.ok) {
    throw new Error(
      `Commerce verification failed after ${repairAttemptsUsed} repair attempts`,
    );
  }

  await emitProgress("build", "succeeded", "Build and tests passed");
  console.log(`[generate-store] validateAndRepairWorkspace DONE repairs=${repairAttemptsUsed}`);

  return {
    verification,
    repairAttemptsUsed,
    modifiedFiles,
    modifiedFilesSummary,
    logsSummary,
    codexActivity,
  };
}

async function persistGeneratedArtifactMetadata({
  input,
  preparedWorkspace,
  productAssets,
  validation,
}: {
  input: GenerateStoreWorkflowInput;
  preparedWorkspace: PreparedWorkspace;
  productAssets: ProductAssetMetadata;
  validation: Awaited<ReturnType<typeof validateAndRepairWorkspace>>;
}): Promise<GenerateStoreWorkflowResult> {
  "use step";

  console.log(`[generate-store] persistGeneratedArtifactMetadata START store=${input.storeId}`);
  await emitProgress(
    "preparing_deployment",
    "running",
    "Preparing generated repository artifact metadata",
  );

  const artifactMetadata = {
    workspaceRoot: preparedWorkspace.root,
    workspacePath: preparedWorkspace.workspacePath,
    productAssets,
    buildResult: "passed",
    repairAttemptsUsed: validation.repairAttemptsUsed,
    modifiedFiles: validation.modifiedFiles,
  };

  await updateWorkflowRun(input.workflowRunId, {
    status: "succeeded",
    currentStep: "completed",
    repairCount: validation.repairAttemptsUsed,
    logsSummary: summarizeLines(validation.logsSummary),
    modifiedFilesSummary: validation.modifiedFilesSummary,
    codexActivitySummary: summarizeLines(validation.codexActivity),
    workspacePath: preparedWorkspace.workspacePath,
    artifactMetadata,
    completedAt: new Date().toISOString(),
  });
  await updateStoreStatus(input.storeId, "generated");
  await emitProgress(
    "preparing_deployment",
    "succeeded",
    "Repository artifact metadata persisted",
  );
  console.log("[generate-store] persistGeneratedArtifactMetadata DONE");

  return {
    success: true,
    workspacePath: preparedWorkspace.workspacePath,
    repairAttemptsUsed: validation.repairAttemptsUsed,
    modifiedFiles: validation.modifiedFiles,
    modifiedFilesSummary: validation.modifiedFilesSummary,
    buildResult: "passed",
  };
}

async function markWorkflowFailed(
  input: GenerateStoreWorkflowInput,
  message: string,
) {
  "use step";

  console.error(`[generate-store] FAILED ${message}`);
  await updateWorkflowRun(input.workflowRunId, {
    status: "failed",
    currentStep: "failed",
    completedAt: new Date().toISOString(),
    errorMessage: message,
  });
  await updateStoreStatus(input.storeId, "failed");
  await emitProgress("failed", "failed", message);
}

async function emitProgress(
  step: string,
  status: GenerateStoreWorkflowEvent["status"],
  message: string,
) {
  "use step";

  const writer = getWritable<GenerateStoreWorkflowEvent>().getWriter();

  try {
    await writer.write({
      type: "progress",
      step,
      status,
      message,
    });
  } finally {
    writer.releaseLock();
  }
}

async function runCodexTurnWithStreaming({
  workspacePath,
  prompt,
  label,
}: {
  workspacePath: string;
  prompt: string;
  label: string;
}) {
  const codex = createStoreForgeCodexClient({
    apiKey: process.env.CODEX_API_KEY,
    baseUrl: process.env.CODEX_BASE_URL,
  });
  const thread = startWorkspaceThread(codex, {
    workingDirectory: workspacePath,
    model: process.env.CODEX_MODEL,
    skipGitRepoCheck: false,
  });
  const writer = getWritable<GenerateStoreWorkflowEvent>().getWriter();
  const activity: string[] = [];

  try {
    const { events } = await thread.runStreamed(prompt);

    for await (const event of events) {
      const line = formatCodexEventLine(event);
      activity.push(`[${label}] ${line}`);

      if (shouldStreamCodexLine(line)) {
        await writer.write({
          type: "progress",
          step: "codex",
          status: "running",
          message: line,
        });
      }

      if (event.type === "turn.failed") {
        throw new Error(event.error.message);
      }

      if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  } finally {
    writer.releaseLock();
  }

  return activity;
}

async function verifyCommerceWorkspace(
  workspacePath: string,
  siteName: string,
): Promise<VerificationResult> {
  const env = {
    SITE_NAME: siteName,
    COMPANY_NAME: siteName,
    SHOPIFY_REVALIDATION_SECRET: "storeforge-workflow",
    SHOPIFY_STORE_DOMAIN: "",
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: "",
  };
  const commands = [`${PNPM} build`, `${PNPM} test`];
  const results: CommandResult[] = [];

  for (const command of commands) {
    const result = await runCommand(command, {
      cwd: workspacePath,
      env,
      timeoutMs: 600000,
    });
    results.push(result);

    if (result.exitCode !== 0) {
      return {
        ok: false,
        failedCommand: result,
        commands: results,
      };
    }
  }

  return {
    ok: true,
    failedCommand: null,
    commands: results,
  };
}

async function getModifiedFiles(workspacePath: string) {
  const result = await runCommand("git status --short", {
    cwd: workspacePath,
    timeoutMs: 30000,
  });

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[AMDRCU?! ]+\s+/, ""));
}

async function getModifiedFileSummary(workspacePath: string) {
  const result = await runCommand("git diff --stat", {
    cwd: workspacePath,
    timeoutMs: 30000,
  });

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function runCommand(
  command: string,
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs: number;
  },
): Promise<CommandResult> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;

      settled = true;
      child.kill("SIGTERM");
      resolve({
        command,
        exitCode: null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${Buffer.concat(stderrChunks).toString("utf8")}\nTimed out after ${options.timeoutMs}ms`,
        durationMs: Date.now() - startedAt,
      });
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.once("error", (error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      resolve({
        command,
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function runRequiredCommand(
  command: string,
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs: number;
  },
) {
  const result = await runCommand(command, options);

  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command}`,
        `Exit code: ${result.exitCode ?? "unknown"}`,
        "stdout:",
        tail(result.stdout),
        "stderr:",
        tail(result.stderr),
      ].join("\n"),
    );
  }

  return result;
}

function summarizeCommand(command: CommandResult) {
  return [
    `${command.command} exited ${command.exitCode ?? "unknown"} in ${Math.round(command.durationMs / 1000)}s`,
    tail(command.stdout || command.stderr, 1200),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCodexEventLine(event: ThreadEvent) {
  let line = "[codex] event";
  logCodexEvent(event, (message) => {
    line = message;
  });
  return line;
}

function shouldStreamCodexLine(line: string) {
  return (
    line.includes("thread.started") ||
    line.includes("turn.started") ||
    line.includes("turn.completed") ||
    line.includes("file_change") ||
    line.includes("command_execution") ||
    line.includes("agent_message") ||
    line.includes("turn.failed") ||
    line.includes("error")
  );
}

function summarizeLines(lines: string[], maxLines = 24) {
  return lines
    .flatMap((line) => line.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines);
}

function tail(value: string, maxLength = 2000) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(value.length - maxLength);
}
