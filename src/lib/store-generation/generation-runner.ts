import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ThreadEvent } from "@openai/codex-sdk";

import {
  createStoreForgeCodexClient,
  logCodexEvent,
  startWorkspaceThread,
} from "../../../lib/codex/client";
import {
  buildCommerceRepairPrompt,
  buildCommerceTransformPrompt,
} from "../../../prompts/codex-transform";
import { getStoreJob } from "../stores/repository";
import {
  createWorkflowEvent,
  updateStoreStatus,
  updateWorkflowRun,
} from "../stores/workflow-runs";
import type {
  StoreGenerationRunInput,
  StoreGenerationRunResult,
} from "./generation-types";
import { startSandboxStoreGeneration } from "./sandbox-generation";
import { shouldUseSandboxGeneration } from "./sandbox-runtime";

export type {
  StoreGenerationRunInput,
  StoreGenerationRunResult,
} from "./generation-types";

const MAX_REPAIR_ATTEMPTS = 2;
const PNPM = "npx --yes pnpm@10.33.0";
const COMMERCE_TEMPLATE_CACHE_PATH = path.join(
  os.tmpdir(),
  "storeforge-cache",
  "commerce-template",
);
const COMMERCE_TEMPLATE_REPO_PATH = path.join(
  COMMERCE_TEMPLATE_CACHE_PATH,
  "commerce",
);
type PreparedWorkspace = {
  root: string;
  workspacePath: string;
  installLogSummary: string;
  templateLogSummary: string;
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

type VerificationOptions = {
  cleanBeforeBuild?: boolean;
  retryOpaqueBuildFailure?: boolean;
};

export async function runStoreGeneration(
  input: StoreGenerationRunInput,
): Promise<StoreGenerationRunResult> {
  if (shouldUseSandboxGeneration()) {
    return startSandboxStoreGeneration(input);
  }

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
    await markWorkflowFailed(input, formatUnknownError(error));
    throw error;
  }
}

async function prepareWorkspace(
  input: StoreGenerationRunInput,
): Promise<PreparedWorkspace> {
  console.log(`[generate-store] prepareWorkspace START store=${input.storeId}`);
  await emitWorkflowEvent(
    input,
    "workspace",
    "running",
    "Preparing Commerce workspace",
  );
  await updateStoreStatus(input.storeId, "generating");
  await updateWorkflowRun(input.workflowRunId, {
    status: "running",
    currentStep: "workspace",
  });

  const root = await mkdtemp(path.join(os.tmpdir(), "storeforge-commerce-"));
  const workspacePath = path.join(root, "commerce");

  const templateLogSummary = await ensureCommerceTemplateCache();

  await runRequiredCommand(
    `git -C ${shellQuote(COMMERCE_TEMPLATE_REPO_PATH)} worktree prune`,
    {
      cwd: COMMERCE_TEMPLATE_CACHE_PATH,
      timeoutMs: 30000,
    },
  );
  await runRequiredCommand(
    `git -C ${shellQuote(COMMERCE_TEMPLATE_REPO_PATH)} worktree add --detach ${shellQuote(workspacePath)} HEAD`,
    {
      cwd: root,
      timeoutMs: 120000,
    },
  );

  let install = await runCommand(
    `${PNPM} install --offline --frozen-lockfile`,
    {
      cwd: workspacePath,
      cleanEnv: true,
      timeoutMs: 600000,
    },
  );

  if (install.exitCode !== 0) {
    install = await runRequiredCommand(`${PNPM} install --frozen-lockfile`, {
      cwd: workspacePath,
      cleanEnv: true,
      timeoutMs: 600000,
    });
  }

  const installLogSummary = summarizeCommand(install);
  await updateWorkflowRun(input.workflowRunId, {
    workspacePath,
    logsSummary: [templateLogSummary, installLogSummary],
  });
  await emitWorkflowEvent(
    input,
    "workspace",
    "succeeded",
    "Workspace prepared",
  );
  console.log(
    `[generate-store] prepareWorkspace DONE workspace=${workspacePath}`,
  );

  return {
    root,
    workspacePath,
    installLogSummary,
    templateLogSummary,
  };
}

async function ensureCommerceTemplateCache() {
  await mkdir(COMMERCE_TEMPLATE_CACHE_PATH, { recursive: true });

  const hasCachedRepo = await pathExists(
    path.join(COMMERCE_TEMPLATE_REPO_PATH, ".git"),
  );
  const status = hasCachedRepo
    ? await runCommand("git rev-parse --is-inside-work-tree", {
        cwd: COMMERCE_TEMPLATE_REPO_PATH,
        timeoutMs: 30000,
      })
    : null;

  if (status?.exitCode !== 0) {
    await rm(COMMERCE_TEMPLATE_REPO_PATH, { force: true, recursive: true });
    await runRequiredCommand(
      "git clone --depth 1 https://github.com/vercel/commerce commerce",
      {
        cwd: COMMERCE_TEMPLATE_CACHE_PATH,
        timeoutMs: 120000,
      },
    );

    const install = await runRequiredCommand(
      `${PNPM} install --frozen-lockfile`,
      {
        cwd: COMMERCE_TEMPLATE_REPO_PATH,
        cleanEnv: true,
        timeoutMs: 600000,
      },
    );

    return [
      `Prepared Commerce template cache at ${COMMERCE_TEMPLATE_REPO_PATH}`,
      summarizeCommand(install),
    ].join("\n");
  }

  const reset = await runRequiredCommand("git reset --hard HEAD", {
    cwd: COMMERCE_TEMPLATE_REPO_PATH,
    timeoutMs: 30000,
  });
  await runRequiredCommand("git clean -fd", {
    cwd: COMMERCE_TEMPLATE_REPO_PATH,
    timeoutMs: 30000,
  });

  return [
    `Reused Commerce template cache at ${COMMERCE_TEMPLATE_REPO_PATH}`,
    summarizeCommand(reset),
  ].join("\n");
}

async function generateProductAssets(
  input: StoreGenerationRunInput,
): Promise<ProductAssetMetadata> {
  console.log(
    `[generate-store] generateProductAssets START store=${input.storeId}`,
  );
  await emitWorkflowEvent(
    input,
    "products",
    "running",
    "Generating product placeholders",
  );
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
  await emitWorkflowEvent(
    input,
    "products",
    "succeeded",
    "Product metadata prepared",
  );
  console.log(
    `[generate-store] generateProductAssets DONE count=${productAssets.length}`,
  );

  return productAssets;
}

async function executeCodexTransformation(
  input: StoreGenerationRunInput,
  workspacePath: string,
) {
  console.log(
    `[generate-store] executeCodexTransformation START store=${input.storeId}`,
  );
  await emitWorkflowEvent(
    input,
    "codex",
    "running",
    "Codex transforming storefront",
  );
  await updateWorkflowRun(input.workflowRunId, {
    currentStep: "codex",
  });

  const store = await getStoreJob(input.storeId);

  if (!store) {
    throw new Error(`Store ${input.storeId} not found`);
  }

  const activity = await runCodexTurnWithStreaming({
    workflowRunId: input.workflowRunId,
    workspacePath,
    prompt: buildCommerceTransformPrompt({ blueprint: store.blueprint }),
    label: "transform",
  });

  await updateWorkflowRun(input.workflowRunId, {
    codexActivitySummary: summarizeLines(activity),
  });
  await emitWorkflowEvent(
    input,
    "codex",
    "succeeded",
    "Codex transformation complete",
  );
  console.log("[generate-store] executeCodexTransformation DONE");
}

async function validateAndRepairWorkspace(
  input: StoreGenerationRunInput,
  workspacePath: string,
) {
  console.log(
    `[generate-store] validateAndRepairWorkspace START store=${input.storeId}`,
  );
  await emitWorkflowEvent(
    input,
    "build",
    "running",
    "Running build and test validation",
  );
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
    {
      retryOpaqueBuildFailure: true,
    },
  );
  const logsSummary = verification.commands.map(summarizeCommand);
  const codexActivity: string[] = [];

  while (!verification.ok && repairAttemptsUsed < MAX_REPAIR_ATTEMPTS) {
    repairAttemptsUsed += 1;
    const failedCommand = verification.failedCommand;

    if (!failedCommand) {
      break;
    }

    await emitWorkflowEvent(
      input,
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
      workflowRunId: input.workflowRunId,
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
      {
        retryOpaqueBuildFailure: true,
      },
    );
    logsSummary.push(...verification.commands.map(summarizeCommand));
  }

  if (!verification.ok) {
    await emitWorkflowEvent(
      input,
      "build",
      "running",
      "Running final clean validation before failing",
    );
    const finalVerification = await verifyCommerceWorkspace(
      workspacePath,
      store.blueprint.storeName,
      {
        cleanBeforeBuild: true,
        retryOpaqueBuildFailure: true,
      },
    );
    logsSummary.push(...finalVerification.commands.map(summarizeCommand));
    verification = finalVerification;
  }

  const modifiedFiles = await getModifiedFiles(workspacePath);
  const modifiedFilesSummary = await getModifiedFileSummary(workspacePath);
  const generatedDiff = await getGeneratedDiff(workspacePath);

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
      failedCommandOutput: verification.failedCommand
        ? serializeCommandResult(verification.failedCommand)
        : null,
      modifiedFiles,
      generatedDiff,
    },
  });

  if (!verification.ok) {
    throw new Error(
      `Commerce verification failed after ${repairAttemptsUsed} repair attempts`,
    );
  }

  await emitWorkflowEvent(
    input,
    "build",
    "succeeded",
    "Build and tests passed",
  );
  console.log(
    `[generate-store] validateAndRepairWorkspace DONE repairs=${repairAttemptsUsed}`,
  );

  return {
    verification,
    repairAttemptsUsed,
    modifiedFiles,
    modifiedFilesSummary,
    generatedDiff,
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
  input: StoreGenerationRunInput;
  preparedWorkspace: PreparedWorkspace;
  productAssets: ProductAssetMetadata;
  validation: Awaited<ReturnType<typeof validateAndRepairWorkspace>>;
}): Promise<StoreGenerationRunResult> {
  console.log(
    `[generate-store] persistGeneratedArtifactMetadata START store=${input.storeId}`,
  );
  await emitWorkflowEvent(
    input,
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
    generatedDiff: validation.generatedDiff,
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
  await emitWorkflowEvent(
    input,
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
  await emitProgress(step, status, message);
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

async function emitProgress(
  step: string,
  status: "running" | "succeeded" | "failed",
  message: string,
) {
  console.log(`[generate-store] ${step} ${status}: ${message}`);
}

async function runCodexTurnWithStreaming({
  workflowRunId,
  workspacePath,
  prompt,
  label,
}: {
  workflowRunId: string;
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
  const activity: string[] = [];

  const { events } = await thread.runStreamed(prompt);

  for await (const event of events) {
    const line = formatCodexEventLine(event);
    activity.push(`[${label}] ${line}`);

    if (shouldStreamCodexLine(line)) {
      console.log(line);
    }

    if (activity.length % 8 === 0) {
      await updateWorkflowRun(workflowRunId, {
        codexActivitySummary: summarizeLines(activity),
      });
    }

    if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return activity;
}

async function verifyCommerceWorkspace(
  workspacePath: string,
  siteName: string,
  options: VerificationOptions = {},
): Promise<VerificationResult> {
  const env = {
    SITE_NAME: siteName,
    COMPANY_NAME: siteName,
    SHOPIFY_REVALIDATION_SECRET: "storeforge-workflow",
    SHOPIFY_STORE_DOMAIN: "",
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: "",
  };
  const commands = [
    `${PNPM} exec prettier --write --ignore-unknown .`,
    ...(options.cleanBeforeBuild ? ["rm -rf .next"] : []),
    `${PNPM} build`,
    `${PNPM} test`,
  ];
  const results: CommandResult[] = [];

  for (const command of commands) {
    const result = await runCommand(command, {
      cwd: workspacePath,
      cleanEnv: true,
      env,
      timeoutMs: 600000,
    });
    results.push(result);

    if (result.exitCode !== 0) {
      if (options.retryOpaqueBuildFailure && isOpaqueBuildFailure(result)) {
        const retry = await runCommand(command, {
          cwd: workspacePath,
          cleanEnv: true,
          env,
          timeoutMs: 600000,
        });
        results.push(retry);

        if (retry.exitCode === 0) {
          continue;
        }

        return {
          ok: false,
          failedCommand: retry,
          commands: results,
        };
      }

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

async function getGeneratedDiff(workspacePath: string) {
  const result = await runCommand("git diff --no-ext-diff --unified=40 -- .", {
    cwd: workspacePath,
    timeoutMs: 30000,
  });

  return truncateGeneratedDiff(result.stdout);
}

function runCommand(
  command: string,
  options: {
    cwd: string;
    cleanEnv?: boolean;
    env?: Record<string, string>;
    timeoutMs: number;
  },
): Promise<CommandResult> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const childEnv = {
      ...(options.cleanEnv ? buildCleanCommandEnv() : process.env),
      ...options.env,
    } as NodeJS.ProcessEnv;
    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      env: childEnv,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    };
    const child = spawn(command, spawnOptions);
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
    cleanEnv?: boolean;
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
    tail(formatCommandOutput(command), 12000),
  ]
    .filter(Boolean)
    .join("\n");
}

function serializeCommandResult(command: CommandResult) {
  return {
    command: command.command,
    exitCode: command.exitCode,
    durationMs: command.durationMs,
    stdout: command.stdout,
    stderr: command.stderr,
    output: formatCommandOutput(command),
  };
}

function formatCommandOutput(command: CommandResult) {
  return [
    command.stdout ? ["stdout:", command.stdout].join("\n") : "",
    command.stderr ? ["stderr:", command.stderr].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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

function summarizeLines(lines: string[], maxLines = 80) {
  return lines
    .flatMap((line) => line.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines);
}

function isOpaqueBuildFailure(command: CommandResult) {
  if (!command.command.includes(" build") || command.exitCode === 0) {
    return false;
  }

  const output = formatCommandOutput(command);

  return (
    output.includes("ELIFECYCLE") &&
    !/error[:\s]|failed to compile|type error|syntaxerror|referenceerror|module not found/i.test(
      output,
    )
  );
}

function tail(value: string, maxLength = 2000) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(value.length - maxLength);
}

function truncateGeneratedDiff(value: string, maxLength = 120000) {
  if (value.length <= maxLength) {
    return value;
  }

  const headLength = Math.floor(maxLength * 0.7);
  const tailLength = maxLength - headLength;

  return [
    value.slice(0, headLength),
    "\n\n[StoreForge truncated generated diff]\n\n",
    value.slice(value.length - tailLength),
  ].join("");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildCleanCommandEnv() {
  const allowedKeys = [
    "PATH",
    "HOME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
  ];
  const env: Record<string, string> = {};

  for (const key of allowedKeys) {
    const value = process.env[key];

    if (value) {
      env[key] = value;
    }
  }

  return env;
}

async function pathExists(value: string) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.stack
      ? `${error.message}\n${tail(error.stack)}`
      : error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}
