import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ThreadEvent } from "@openai/codex-sdk";
import { Sandbox } from "@vercel/sandbox";

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
const COMMERCE_REPO_URL =
  process.env.STOREFORGE_COMMERCE_REPO_URL ??
  "https://github.com/vercel/commerce.git";
const SANDBOX_WORKSPACE_PATH = "/vercel/sandbox";
const SANDBOX_TRANSFORM_PROMPT_PATH = "/tmp/storeforge-transform-prompt.txt";
const SANDBOX_BLUEPRINT_PATH = "/tmp/storeforge-blueprint.json";
const SANDBOX_PRODUCT_ASSETS_PATH = "/tmp/storeforge-product-assets.json";
const SANDBOX_JOB_PATH = "/tmp/storeforge-sandbox-job.mjs";

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

async function startSandboxStoreGeneration(
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

    const sandbox = await Sandbox.create({
      ...getSandboxCredentials(),
      source: getSandboxSource(),
      runtime: "node24",
      resources: { vcpus: 4 },
      timeout: Number(process.env.STOREFORGE_SANDBOX_TIMEOUT_MS ?? 2700000),
      env: getSandboxJobEnvironment(input),
    } as Parameters<typeof Sandbox.create>[0]);

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

    const command = await sandbox.runCommand({
      cmd: "node",
      args: [SANDBOX_JOB_PATH],
      cwd: SANDBOX_WORKSPACE_PATH,
      detached: true,
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

function shouldUseSandboxGeneration() {
  const runtime = process.env.STOREFORGE_GENERATION_RUNTIME;

  if (runtime === "local") {
    return false;
  }

  if (runtime === "sandbox") {
    return true;
  }

  return process.env.VERCEL === "1";
}

function getSandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_ORG_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }

  return {};
}

function getSandboxSource() {
  const snapshotId = process.env.STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID;

  if (snapshotId) {
    return {
      type: "snapshot" as const,
      snapshotId,
    };
  }

  return {
    type: "git" as const,
    url: COMMERCE_REPO_URL,
    depth: 1,
  };
}

function getSandboxSourceLabel() {
  const snapshotId = process.env.STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID;

  return snapshotId ? `snapshot:${snapshotId}` : `git:${COMMERCE_REPO_URL}`;
}

function getSandboxJobEnvironment(input: StoreGenerationRunInput) {
  return compactEnv({
    STORE_ID: input.storeId,
    WORKFLOW_RUN_ID: input.workflowRunId,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CODEX_API_KEY: process.env.CODEX_API_KEY,
    OPENAI_API_KEY: process.env.CODEX_API_KEY,
    CODEX_BASE_URL: process.env.CODEX_BASE_URL,
    CODEX_MODEL: process.env.CODEX_MODEL,
    CODEX_CLI_PACKAGE: process.env.CODEX_CLI_PACKAGE ?? "@openai/codex@0.130.0",
    CODEX_SANDBOX_MODE: process.env.CODEX_SANDBOX_MODE ?? "danger-full-access",
    PNPM_VERSION: "10.33.0",
  });
}

function compactEnv(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
}

function buildSandboxJobScript() {
  return String.raw`import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const WORKSPACE = '/vercel/sandbox';
const TRANSFORM_PROMPT_PATH = '/tmp/storeforge-transform-prompt.txt';
const BLUEPRINT_PATH = '/tmp/storeforge-blueprint.json';
const PRODUCT_ASSETS_PATH = '/tmp/storeforge-product-assets.json';
const MAX_REPAIR_ATTEMPTS = 2;
const PNPM_VERSION = process.env.PNPM_VERSION || '10.33.0';
const PNPM = 'npx --yes pnpm@' + PNPM_VERSION;

const storeId = requiredEnv('STORE_ID');
const workflowRunId = requiredEnv('WORKFLOW_RUN_ID');
const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

const blueprint = JSON.parse(await readFile(BLUEPRINT_PATH, 'utf8'));
const productAssets = JSON.parse(await readFile(PRODUCT_ASSETS_PATH, 'utf8'));

await main().catch(async (error) => {
  const message = formatUnknownError(error);
  await patchWorkflowRun({
    status: 'failed',
    currentStep: 'failed',
    completedAt: new Date().toISOString(),
    errorMessage: message,
    logsSummary: summarizeLines([message]),
  }).catch(() => null);
  await emitEvent('failed', 'failed', message).catch(() => null);
  await patchStoreStatus('failed').catch(() => null);
  console.error(message);
  process.exitCode = 1;
});

async function main() {
  await patchStoreStatus('generating');
  await patchWorkflowRun({
    status: 'running',
    currentStep: 'workspace',
    workspacePath: WORKSPACE,
    logsSummary: ['Sandbox generation job started'],
    artifactMetadata: {
      productAssets,
      heroImagePrompt: blueprint.heroImagePrompt,
      sandboxWorkspacePath: WORKSPACE,
    },
  });
  await emitEvent('workspace', 'running', 'Checking Commerce dependencies');
  const install = await ensureDependencies();
  await patchWorkflowRun({
    currentStep: 'products',
    logsSummary: summarizeLines([
      'Sandbox generation job started',
      summarizeCommand(install),
    ]),
  });
  await emitEvent(
    'workspace',
    'succeeded',
    install.exitCode === 0 && install.stdout.includes('node_modules present')
      ? 'Commerce dependencies already present'
      : 'Commerce dependencies installed',
    { durationMs: install.durationMs },
  );
  await emitEvent('products', 'running', 'Sandbox generation job started');

  const preflight = await runCommand('pwd && test -f app/page.tsx && test -f app/layout.tsx', {
    timeoutMs: 30_000,
  });

  if (preflight.exitCode !== 0) {
    throw new Error(
      'Commerce workspace preflight failed before Codex transformation: ' +
        summarizeCommand(preflight),
    );
  }

  await patchWorkflowRun({
    currentStep: 'codex',
    logsSummary: [
      'Product metadata prepared',
      'Commerce workspace preflight passed',
      'Starting Codex transformation',
    ],
  });
  await emitEvent('codex', 'running', 'Starting Codex transformation');

  const transformActivity = await runCodex({
    label: 'transform',
    promptPath: TRANSFORM_PROMPT_PATH,
  });
  await emitEvent('codex', 'succeeded', 'Codex transformation finished');

  await patchWorkflowRun({
    currentStep: 'build',
    codexActivitySummary: summarizeLines(transformActivity),
    logsSummary: ['Codex transformation finished', 'Running Commerce validation'],
  });
  await emitEvent('build', 'running', 'Running Commerce validation');

  let repairAttemptsUsed = 0;
  let verification = await verifyCommerceWorkspace({
    retryOpaqueBuildFailure: true,
  });
  const logsSummary = verification.commands.map(summarizeCommand);
  const codexActivity = [...transformActivity];

  while (!verification.ok && repairAttemptsUsed < MAX_REPAIR_ATTEMPTS) {
    repairAttemptsUsed += 1;

    if (!verification.failedCommand) {
      break;
    }

    await patchWorkflowRun({
      currentStep: 'repair',
      repairCount: repairAttemptsUsed,
      logsSummary: summarizeLines(logsSummary),
    });
    await emitEvent(
      'repair',
      'running',
      'Repairing build issues (' + repairAttemptsUsed + '/' + MAX_REPAIR_ATTEMPTS + ')',
      { repairAttempt: repairAttemptsUsed },
    );

    const modifiedFiles = await getModifiedFiles();
    const repairPromptPath = '/tmp/storeforge-repair-' + repairAttemptsUsed + '.txt';
    await writeFile(
      repairPromptPath,
      buildRepairPrompt({
        attempt: repairAttemptsUsed,
        command: verification.failedCommand,
        modifiedFiles,
      }),
    );

    const repairActivity = await runCodex({
      label: 'repair-' + repairAttemptsUsed,
      promptPath: repairPromptPath,
    });
    codexActivity.push(...repairActivity);

    verification = await verifyCommerceWorkspace({
      retryOpaqueBuildFailure: true,
    });
    logsSummary.push(...verification.commands.map(summarizeCommand));
  }

  if (!verification.ok) {
    await patchWorkflowRun({
      currentStep: 'build',
      logsSummary: summarizeLines([
        ...logsSummary,
        'Running final clean validation before failing',
      ]),
    });
    await emitEvent('build', 'running', 'Running final clean validation before failing');
    verification = await verifyCommerceWorkspace({
      cleanBeforeBuild: true,
      retryOpaqueBuildFailure: true,
    });
    logsSummary.push(...verification.commands.map(summarizeCommand));
  }

  const modifiedFiles = await getModifiedFiles();
  const modifiedFilesSummary = await getModifiedFileSummary();
  const generatedDiff = await getGeneratedDiff();
  const commandResults = verification.commands.map((command) => ({
    command: command.command,
    exitCode: command.exitCode,
    durationMs: command.durationMs,
  }));

  await patchWorkflowRun({
    status: verification.ok ? 'succeeded' : 'failed',
    currentStep: verification.ok ? 'completed' : 'failed',
    repairCount: repairAttemptsUsed,
    logsSummary: summarizeLines(logsSummary),
    modifiedFilesSummary,
    codexActivitySummary: summarizeLines(codexActivity),
    workspacePath: WORKSPACE,
    artifactMetadata: {
      productAssets,
      heroImagePrompt: blueprint.heroImagePrompt,
      buildResult: verification.ok ? 'passed' : 'failed',
      commandResults,
      failedCommandOutput: verification.failedCommand
        ? serializeCommandResult(verification.failedCommand)
        : null,
      modifiedFiles,
      generatedDiff,
      sandboxWorkspacePath: WORKSPACE,
    },
    completedAt: new Date().toISOString(),
    errorMessage: verification.ok
      ? null
      : 'Commerce verification failed after ' + repairAttemptsUsed + ' repair attempts',
  });
  await emitEvent(
    verification.ok ? 'preparing_deployment' : 'failed',
    verification.ok ? 'succeeded' : 'failed',
    verification.ok
      ? 'Repository artifact metadata persisted'
      : 'Commerce verification failed',
    { repairAttemptsUsed },
  );

  await patchStoreStatus(verification.ok ? 'generated' : 'failed');

  if (!verification.ok) {
    throw new Error(
      'Commerce verification failed after ' + repairAttemptsUsed + ' repair attempts',
    );
  }
}

async function runCodex({ label, promptPath }) {
  const model = process.env.CODEX_MODEL
    ? ' --model ' + shellQuote(process.env.CODEX_MODEL)
    : '';
  const codexPackage = process.env.CODEX_CLI_PACKAGE || '@openai/codex@0.130.0';
  const sandboxMode = process.env.CODEX_SANDBOX_MODE || 'danger-full-access';
  const command =
    'npx --yes ' +
    shellQuote(codexPackage) +
    ' exec --json --sandbox ' +
    shellQuote(sandboxMode) +
    ' --skip-git-repo-check --config ' +
    shellQuote('approval_policy="never"') +
    ' --config ' +
    shellQuote('web_search="disabled"') +
    ' --cd ' +
    shellQuote(WORKSPACE) +
    model +
    ' - < ' +
    shellQuote(promptPath);
  const activity = [];

  const result = await runCommand(command, {
    env: buildCodexEnv(),
    timeoutMs: 1_200_000,
    onStdoutLine: async (line) => {
      const activityLine = await handleCodexJsonLine(label, line);

      if (!activityLine) {
        return;
      }

      activity.push(activityLine);

      if (activity.length % 5 === 0) {
        await patchWorkflowRun({
          codexActivitySummary: summarizeLines(activity),
        });
      }
    },
  });
  const outputLines = activity.length
    ? summarizeLines(activity)
    : summarizeLines([result.stdout, result.stderr]).map(
        (line) => '[' + label + '] ' + line,
      );

  await patchWorkflowRun({
    codexActivitySummary: outputLines,
  });

  if (result.exitCode !== 0) {
    throw new Error(summarizeCommand(result));
  }

  return outputLines;
}

async function handleCodexJsonLine(label, line) {
  if (!line.trim()) {
    return null;
  }

  let event;

  try {
    event = JSON.parse(line);
  } catch {
    return '[' + label + '] ' + line;
  }

  const summary = summarizeCodexEvent(event);
  await emitCodexEvent(label, event, summary);

  return '[' + label + '] ' + summary.message;
}

async function emitCodexEvent(label, event, summary) {
  await supabaseInsert('/rest/v1/workflow_events', {
    workflow_run_id: workflowRunId,
    store_id: storeId,
    trace_id: workflowRunId,
    event_name: summary.eventName,
    step: label.startsWith('repair') ? 'repair' : 'codex',
    status: summary.status,
    message: summary.message,
    attributes: {
      label,
      eventType: event.type,
      ...summary.attributes,
    },
  }).catch((error) => {
    console.warn('[workflow-events] failed to record Codex event', error);
  });
}

function summarizeCodexEvent(event) {
  if (event.type === 'thread.started') {
    return {
      eventName: 'codex.thread.started',
      status: 'info',
      message: 'Codex thread started',
      attributes: { threadId: event.thread_id },
    };
  }

  if (event.type === 'turn.started') {
    return {
      eventName: 'codex.turn.started',
      status: 'running',
      message: 'Codex turn started',
      attributes: {},
    };
  }

  if (event.type === 'turn.completed') {
    return {
      eventName: 'codex.turn.completed',
      status: 'succeeded',
      message: 'Codex turn completed',
      attributes: { usage: event.usage },
    };
  }

  if (event.type === 'turn.failed') {
    return {
      eventName: 'codex.turn.failed',
      status: 'failed',
      message: 'Codex turn failed: ' + (event.error?.message || 'Unknown error'),
      attributes: { error: event.error },
    };
  }

  if (event.type === 'error') {
    return {
      eventName: 'codex.error',
      status: 'failed',
      message: 'Codex stream error: ' + (event.message || 'Unknown error'),
      attributes: { message: event.message },
    };
  }

  if (
    event.type === 'item.started' ||
    event.type === 'item.updated' ||
    event.type === 'item.completed'
  ) {
    return summarizeCodexItemEvent(event);
  }

  return {
    eventName: 'codex.unknown',
    status: 'info',
    message: 'Codex event: ' + String(event.type || 'unknown'),
    attributes: {},
  };
}

function summarizeCodexItemEvent(event) {
  const item = event.item || {};
  const itemType = item.type || 'unknown';
  const status = mapCodexItemStatus(item.status, event.type);
  const eventName = 'codex.' + event.type + '.' + itemType;

  if (itemType === 'command_execution') {
    return {
      eventName,
      status,
      message: 'Command ' + readableStatus(status) + ': ' + tail(item.command, 140),
      attributes: {
        itemId: item.id,
        itemType,
        command: item.command,
        itemStatus: item.status,
        exitCode: item.exit_code ?? null,
        outputTail: tail(item.aggregated_output || '', 2000),
      },
    };
  }

  if (itemType === 'file_change') {
    const changes = Array.isArray(item.changes) ? item.changes : [];

    return {
      eventName,
      status,
      message:
        'File changes ' +
        readableStatus(status) +
        ': ' +
        summarizeFileChanges(changes),
      attributes: {
        itemId: item.id,
        itemType,
        itemStatus: item.status,
        changes,
      },
    };
  }

  if (itemType === 'agent_message') {
    return {
      eventName,
      status: 'info',
      message: 'Agent message: ' + tail(item.text || '', 180),
      attributes: {
        itemId: item.id,
        itemType,
        textTail: tail(item.text || '', 1000),
      },
    };
  }

  if (itemType === 'reasoning') {
    return {
      eventName,
      status: 'info',
      message: 'Reasoning summary updated',
      attributes: {
        itemId: item.id,
        itemType,
        textTail: tail(item.text || '', 1000),
      },
    };
  }

  if (itemType === 'todo_list') {
    const items = Array.isArray(item.items) ? item.items : [];
    const completed = items.filter((todo) => Boolean(todo.completed)).length;

    return {
      eventName,
      status: 'info',
      message: 'Todo list updated: ' + completed + '/' + items.length + ' complete',
      attributes: {
        itemId: item.id,
        itemType,
        completed,
        total: items.length,
        items,
      },
    };
  }

  if (itemType === 'mcp_tool_call') {
    return {
      eventName,
      status,
      message:
        'Tool ' +
        String(item.server || 'unknown') +
        '.' +
        String(item.tool || 'unknown') +
        ' ' +
        readableStatus(status),
      attributes: {
        itemId: item.id,
        itemType,
        server: item.server,
        tool: item.tool,
        itemStatus: item.status,
        error: item.error ?? null,
      },
    };
  }

  if (itemType === 'web_search') {
    return {
      eventName,
      status: 'info',
      message: 'Web search: ' + String(item.query || ''),
      attributes: {
        itemId: item.id,
        itemType,
        query: item.query,
      },
    };
  }

  if (itemType === 'error') {
    return {
      eventName,
      status: 'failed',
      message: 'Codex item error: ' + String(item.message || 'Unknown error'),
      attributes: {
        itemId: item.id,
        itemType,
        message: item.message,
      },
    };
  }

  return {
    eventName,
    status,
    message: 'Codex ' + itemType + ' ' + readableStatus(status),
    attributes: {
      itemId: item.id,
      itemType,
      itemStatus: item.status,
    },
  };
}

function mapCodexItemStatus(itemStatus, eventType) {
  if (itemStatus === 'failed') {
    return 'failed';
  }

  if (itemStatus === 'completed') {
    return 'succeeded';
  }

  if (itemStatus === 'in_progress' || eventType === 'item.started') {
    return 'running';
  }

  return eventType === 'item.completed' ? 'succeeded' : 'info';
}

function readableStatus(status) {
  if (status === 'succeeded') {
    return 'completed';
  }

  return status;
}

function summarizeFileChanges(changes) {
  if (!changes.length) {
    return 'none reported';
  }

  return changes
    .slice(0, 5)
    .map((change) => String(change.kind || 'update') + ':' + String(change.path || 'unknown'))
    .join(', ');
}

async function verifyCommerceWorkspace(options = {}) {
  const commandEnv = {
    SITE_NAME: blueprint.storeName,
    COMPANY_NAME: blueprint.storeName,
    SHOPIFY_REVALIDATION_SECRET: 'storeforge-workflow',
    SHOPIFY_STORE_DOMAIN: '',
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: '',
  };
  const commands = [
    PNPM + ' exec prettier --write --ignore-unknown .',
    ...(options.cleanBeforeBuild ? ['rm -rf .next'] : []),
    PNPM + ' build',
    PNPM + ' test',
  ];
  const results = [];

  for (const command of commands) {
    const result = await runCommand(command, {
      env: commandEnv,
      timeoutMs: 600_000,
    });
    results.push(result);

    if (result.exitCode !== 0) {
      if (options.retryOpaqueBuildFailure && isOpaqueBuildFailure(result)) {
        const retry = await runCommand(command, {
          env: commandEnv,
          timeoutMs: 600_000,
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

async function ensureDependencies() {
  const check = await runCommand('test -d node_modules && echo node_modules present', {
    env: {},
    timeoutMs: 30_000,
  });

  if (check.exitCode === 0) {
    return check;
  }

  return runCommand(PNPM + ' install --frozen-lockfile', {
    env: buildInstallEnv(),
    timeoutMs: 600_000,
  });
}

function runCommand(command, options) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      cwd: WORKSPACE,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const lineHandlerPromises = [];
    let stdoutRemainder = '';
    let settled = false;

    function handleStdoutText(text) {
      if (!options.onStdoutLine) {
        return;
      }

      stdoutRemainder += text;
      const lines = stdoutRemainder.split(/\r?\n/);
      stdoutRemainder = lines.pop() || '';

      for (const line of lines) {
        lineHandlerPromises.push(
          Promise.resolve(options.onStdoutLine(line)).catch((error) => {
            console.warn('[command-stream] stdout line handler failed', error);
          }),
        );
      }
    }

    function flushStdoutRemainder() {
      if (!options.onStdoutLine || !stdoutRemainder) {
        return;
      }

      const line = stdoutRemainder;
      stdoutRemainder = '';
      lineHandlerPromises.push(
        Promise.resolve(options.onStdoutLine(line)).catch((error) => {
          console.warn('[command-stream] stdout line handler failed', error);
        }),
      );
    }

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({
        command,
        exitCode: null,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr:
          Buffer.concat(stderrChunks).toString('utf8') +
          '\nTimed out after ' +
          options.timeoutMs +
          'ms',
        durationMs: Date.now() - startedAt,
      });
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      const buffer = Buffer.from(chunk);
      stdoutChunks.push(buffer);
      handleStdoutText(buffer.toString('utf8'));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', async (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      flushStdoutRemainder();
      await Promise.all(lineHandlerPromises);
      resolve({
        command,
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function getModifiedFiles() {
  const result = await runCommand('git status --short', {
    timeoutMs: 30_000,
    env: {},
  });

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[AMDRCU?! ]+\s+/, ''));
}

async function getModifiedFileSummary() {
  const result = await runCommand('git diff --stat', {
    timeoutMs: 30_000,
    env: {},
  });

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function getGeneratedDiff() {
  const result = await runCommand('git diff --no-ext-diff --unified=40 -- .', {
    timeoutMs: 30_000,
    env: {},
  });

  return truncateGeneratedDiff(result.stdout);
}

function buildRepairPrompt({ attempt, command, modifiedFiles }) {
  return [
    'You are repairing a StoreForge transformation of Vercel Commerce.',
    '',
    'Constraints:',
    '- Do not rewrite checkout/cart/core commerce infrastructure.',
    '- Keep repairs small and targeted.',
    '- Preserve TypeScript correctness and responsive UX.',
    '- Do not add new dependencies.',
    '- Formatting runs separately, so focus on the real build/test issue.',
    '',
    'Repair attempt ' + attempt + ' of ' + MAX_REPAIR_ATTEMPTS + '.',
    '',
    'Failed command:',
    command.command,
    '',
    'Exit code:',
    String(command.exitCode ?? 'unknown'),
    '',
    'Recent stdout:',
    tail(command.stdout, 8000),
    '',
    'Recent stderr:',
    tail(command.stderr, 8000),
    '',
    'Modified files:',
    modifiedFiles.length ? modifiedFiles.join('\n') : 'None detected',
    '',
    'Fix only the cause of this failure, then stop.',
  ].join('\n');
}

async function patchWorkflowRun(patch) {
  const body = mapWorkflowRunPatch(patch);

  if (Object.keys(body).length === 0) {
    return;
  }

  await supabasePatch('/rest/v1/workflow_runs?id=eq.' + workflowRunId, body);
}

async function emitEvent(step, status, message, attributes = {}) {
  await supabaseInsert('/rest/v1/workflow_events', {
    workflow_run_id: workflowRunId,
    store_id: storeId,
    trace_id: workflowRunId,
    event_name: 'storeforge.' + step + '.' + status,
    step,
    status,
    message,
    attributes,
  }).catch((error) => {
    console.warn('[workflow-events] failed to record event', error);
  });
}

async function patchStoreStatus(status) {
  await supabasePatch('/rest/v1/stores?id=eq.' + storeId, {
    status,
    updated_at: new Date().toISOString(),
  });
}

async function supabaseInsert(path, body) {
  const response = await fetch(supabaseUrl + path, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: 'Bearer ' + supabaseServiceRoleKey,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      'Supabase POST failed: ' +
        response.status +
        ' ' +
        (await response.text()),
    );
  }
}

async function supabasePatch(path, body) {
  const response = await fetch(supabaseUrl + path, {
    method: 'PATCH',
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: 'Bearer ' + supabaseServiceRoleKey,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      'Supabase PATCH failed: ' +
        response.status +
        ' ' +
        (await response.text()),
    );
  }
}

function mapWorkflowRunPatch(patch) {
  const update = {};

  if ('providerRunId' in patch) update.provider_run_id = patch.providerRunId;
  if ('status' in patch) update.status = patch.status;
  if ('currentStep' in patch) update.current_step = patch.currentStep;
  if ('repairCount' in patch) update.repair_count = patch.repairCount;
  if ('logsSummary' in patch) update.logs_summary = patch.logsSummary;
  if ('modifiedFilesSummary' in patch) {
    update.modified_files_summary = patch.modifiedFilesSummary;
  }
  if ('codexActivitySummary' in patch) {
    update.codex_activity_summary = patch.codexActivitySummary;
  }
  if ('workspacePath' in patch) update.workspace_path = patch.workspacePath;
  if ('artifactMetadata' in patch) update.artifact_metadata = patch.artifactMetadata;
  if ('completedAt' in patch) update.completed_at = patch.completedAt;
  if ('errorMessage' in patch) update.error_message = patch.errorMessage;

  return update;
}

function summarizeCommand(command) {
  return [
    command.command +
      ' exited ' +
      (command.exitCode ?? 'unknown') +
      ' in ' +
      Math.round(command.durationMs / 1000) +
      's',
    tail(formatCommandOutput(command), 12000),
  ]
    .filter(Boolean)
    .join('\n');
}

function serializeCommandResult(command) {
  return {
    command: command.command,
    exitCode: command.exitCode,
    durationMs: command.durationMs,
    stdout: command.stdout,
    stderr: command.stderr,
    output: formatCommandOutput(command),
  };
}

function formatCommandOutput(command) {
  return [
    command.stdout ? 'stdout:\n' + command.stdout : '',
    command.stderr ? 'stderr:\n' + command.stderr : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function summarizeLines(lines, maxLines = 80) {
  return lines
    .flatMap((line) => String(line).split('\n'))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines);
}

function isOpaqueBuildFailure(command) {
  if (!command.command.includes(' build') || command.exitCode === 0) {
    return false;
  }

  const output = formatCommandOutput(command);

  return (
    output.includes('ELIFECYCLE') &&
    !/error[:\s]|failed to compile|type error|syntaxerror|referenceerror|module not found/i.test(
      output,
    )
  );
}

function buildCodexEnv() {
  const env = {};

  if (process.env.CODEX_API_KEY) {
    env.CODEX_API_KEY = process.env.CODEX_API_KEY;
    env.OPENAI_API_KEY = process.env.CODEX_API_KEY;
  }

  if (process.env.CODEX_BASE_URL) {
    env.CODEX_BASE_URL = process.env.CODEX_BASE_URL;
    env.OPENAI_BASE_URL = process.env.CODEX_BASE_URL;
  }

  return env;
}

function buildInstallEnv() {
  return {
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  };
}

function requiredEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error('Missing required environment variable: ' + key);
  }

  return value;
}

function formatUnknownError(error) {
  if (error instanceof Error) {
    return error.stack ? error.message + '\n' + error.stack : error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

function tail(value, maxLength = 2000) {
  value = String(value ?? '');

  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(value.length - maxLength);
}

function truncateGeneratedDiff(value, maxLength = 120000) {
  value = String(value ?? '');

  if (value.length <= maxLength) {
    return value;
  }

  const headLength = Math.floor(maxLength * 0.7);
  const tailLength = maxLength - headLength;

  return [
    value.slice(0, headLength),
    '\n\n[StoreForge truncated generated diff]\n\n',
    value.slice(value.length - tailLength),
  ].join('');
}
`;
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
