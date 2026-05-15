import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  createStoreForgeCodexClient,
  startWorkspaceThread,
  streamCodexTurn,
} from "../lib/codex/client";
import { createMockStoreBlueprint } from "../lib/store-generation/store-blueprint";
import {
  buildCommerceRepairPrompt,
  buildCommerceTransformPrompt,
} from "../prompts/codex-transform";

const COMMERCE_REPO_URL = "https://github.com/vercel/commerce";
const MAX_REPAIR_ATTEMPTS = 2;
const PNPM = "npx --yes pnpm@10.33.0";

interface CommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface VerificationResult {
  ok: boolean;
  failedCommand: CommandResult | null;
  commands: CommandResult[];
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "storeforge-commerce-"));
  const workspace = path.join(root, "commerce");
  const blueprint = createMockStoreBlueprint();

  let repairAttemptsUsed = 0;
  let verification: VerificationResult | null = null;

  try {
    console.log(`[commerce-spike] cloning ${COMMERCE_REPO_URL}`);
    await runRequiredCommand(
      "git clone --depth 1 https://github.com/vercel/commerce commerce",
      {
        cwd: root,
        timeoutMs: 120000,
      },
    );

    console.log(`[commerce-spike] workspace=${workspace}`);
    console.log("[commerce-spike] installing dependencies");
    await runRequiredCommand(`${PNPM} install --frozen-lockfile`, {
      cwd: workspace,
      timeoutMs: 600000,
    });

    const codex = createStoreForgeCodexClient({
      apiKey: process.env.CODEX_API_KEY,
      baseUrl: process.env.CODEX_BASE_URL,
    });
    const thread = startWorkspaceThread(codex, {
      workingDirectory: workspace,
      model: process.env.CODEX_MODEL,
      skipGitRepoCheck: false,
    });

    console.log("[commerce-spike] starting Codex transformation");
    await streamCodexTurn(
      thread,
      buildCommerceTransformPrompt({ blueprint }),
      {
        logger: (line) => console.log(line),
      },
    );

    verification = await verifyCommerceWorkspace(workspace, blueprint.storeName);

    while (!verification.ok && repairAttemptsUsed < MAX_REPAIR_ATTEMPTS) {
      repairAttemptsUsed += 1;
      const modifiedFiles = await getModifiedFiles(workspace);
      const failedCommand = verification.failedCommand;

      if (!failedCommand) {
        break;
      }

      console.log(
        `[commerce-spike] repair attempt ${repairAttemptsUsed}/${MAX_REPAIR_ATTEMPTS}`,
      );

      await streamCodexTurn(
        thread,
        buildCommerceRepairPrompt({
          attempt: repairAttemptsUsed,
          maxAttempts: MAX_REPAIR_ATTEMPTS,
          command: failedCommand.command,
          exitCode: failedCommand.exitCode,
          stdout: failedCommand.stdout,
          stderr: failedCommand.stderr,
          modifiedFiles,
        }),
        {
          logger: (line) => console.log(line),
        },
      );

      verification = await verifyCommerceWorkspace(workspace, blueprint.storeName);
    }

    await printSummary({
      workspace,
      verification,
      repairAttemptsUsed,
    });

    if (!verification.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("[commerce-spike] failure");
    console.error(error instanceof Error ? error.message : error);
    await printSummary({
      workspace,
      verification,
      repairAttemptsUsed,
    });
    process.exitCode = 1;
  }
}

async function verifyCommerceWorkspace(
  workspace: string,
  siteName: string,
): Promise<VerificationResult> {
  const env = {
    SITE_NAME: siteName,
    COMPANY_NAME: siteName,
    SHOPIFY_REVALIDATION_SECRET: "storeforge-spike",
    SHOPIFY_STORE_DOMAIN: "",
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: "",
  };
  const commands = [
    `${PNPM} build`,
    `${PNPM} test`,
  ];
  const results: CommandResult[] = [];

  for (const command of commands) {
    console.log(`[commerce-spike] verifying: ${command}`);
    const result = await runCommand(command, {
      cwd: workspace,
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

async function printSummary({
  workspace,
  verification,
  repairAttemptsUsed,
}: {
  workspace: string;
  verification: VerificationResult | null;
  repairAttemptsUsed: number;
}) {
  const modifiedFiles = await getModifiedFiles(workspace).catch(() => []);
  const modifiedFileSummary = await getModifiedFileSummary(workspace).catch(
    () => [],
  );

  console.log("[commerce-spike] summary");
  console.log(
    JSON.stringify(
      {
        success: verification?.ok ?? false,
        buildResult: verification
          ? verification.ok
            ? "passed"
            : `failed: ${verification.failedCommand?.command}`
          : "not run",
        repairAttemptsUsed,
        workspace,
        modifiedFiles,
        modifiedFileSummary,
        commandResults:
          verification?.commands.map((command) => ({
            command: command.command,
            exitCode: command.exitCode,
            durationMs: command.durationMs,
            stdoutTail: tail(command.stdout),
            stderrTail: tail(command.stderr),
          })) ?? [],
      },
      null,
      2,
    ),
  );
}

async function getModifiedFiles(workspace: string) {
  const result = await runCommand("git status --short", {
    cwd: workspace,
    timeoutMs: 30000,
  });

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[AMDRCU?! ]+\s+/, ""));
}

async function getModifiedFileSummary(workspace: string) {
  const result = await runCommand("git diff --stat", {
    cwd: workspace,
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
      if (settled) {
        return;
      }

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
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode) => {
      if (settled) {
        return;
      }

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

function tail(value: string, maxLength = 2000) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(value.length - maxLength);
}

void main();
