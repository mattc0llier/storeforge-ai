import { Sandbox } from "@vercel/sandbox";

const DEFAULT_COMMERCE_REPO_URL = "https://github.com/vercel/commerce.git";
const DEFAULT_PNPM_VERSION = "10.33.0";
const DEFAULT_TIMEOUT_MS = 2_700_000;
const DEFAULT_SNAPSHOT_EXPIRATION_MS = 2_592_000_000;

async function main() {
  const repoUrl =
    process.env.STOREFORGE_COMMERCE_REPO_URL ?? DEFAULT_COMMERCE_REPO_URL;
  const pnpmVersion = process.env.PNPM_VERSION ?? DEFAULT_PNPM_VERSION;
  const timeout = Number(
    process.env.STOREFORGE_SANDBOX_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );
  const expiration = Number(
    process.env.STOREFORGE_SANDBOX_SNAPSHOT_EXPIRATION_MS ??
      DEFAULT_SNAPSHOT_EXPIRATION_MS,
  );

  console.log("[sandbox:snapshot] creating Commerce sandbox");
  console.log(`[sandbox:snapshot] source=${repoUrl}`);

  const sandbox = await Sandbox.create({
    ...getSandboxCredentials(),
    source: {
      type: "git",
      url: repoUrl,
      depth: 1,
    },
    runtime: "node24",
    resources: { vcpus: 4 },
    timeout,
  } as Parameters<typeof Sandbox.create>[0]);

  console.log(`[sandbox:snapshot] sandbox=${sandbox.sandboxId}`);

  try {
    await runRequiredSandboxCommand({
      sandbox,
      label: "install dependencies",
      cmd: "npx",
      args: [
        "--yes",
        `pnpm@${pnpmVersion}`,
        "install",
        "--frozen-lockfile",
      ],
      cwd: "/vercel/sandbox",
    });

    await runRequiredSandboxCommand({
      sandbox,
      label: "prewarm Codex CLI",
      cmd: "npx",
      args: [
        "--yes",
        process.env.CODEX_CLI_PACKAGE ?? "@openai/codex@0.130.0",
        "--version",
      ],
      cwd: "/vercel/sandbox",
    });

    console.log("[sandbox:snapshot] creating snapshot");
    const snapshot = await sandbox.snapshot({ expiration });

    console.log("[sandbox:snapshot] ready");
    console.log(
      JSON.stringify(
        {
          snapshotId: snapshot.snapshotId,
          sourceSandboxId: snapshot.sourceSandboxId,
          expiresAt: snapshot.expiresAt,
          env: {
            STOREFORGE_COMMERCE_SANDBOX_SNAPSHOT_ID: snapshot.snapshotId,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await sandbox.stop({ blocking: false }).catch(() => null);
    throw error;
  }
}

async function runRequiredSandboxCommand({
  sandbox,
  label,
  cmd,
  args,
  cwd,
}: {
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
  label: string;
  cmd: string;
  args: string[];
  cwd: string;
}) {
  console.log(`[sandbox:snapshot] ${label}`);
  const command = await sandbox.runCommand({
    cmd,
    args,
    cwd,
    env: buildCleanSandboxCommandEnv(),
  });
  const stdout = await command.stdout();
  const stderr = await command.stderr();

  if (stdout.trim()) {
    console.log(tail(stdout, 2000));
  }

  if (stderr.trim()) {
    console.error(tail(stderr, 2000));
  }

  if (command.exitCode !== 0) {
    throw new Error(
      [
        `${label} failed`,
        `command=${cmd} ${args.join(" ")}`,
        `exitCode=${command.exitCode}`,
        "stdout:",
        tail(stdout),
        "stderr:",
        tail(stderr),
      ].join("\n"),
    );
  }
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

function buildCleanSandboxCommandEnv() {
  return {
    HOME: "/home/vercel-sandbox",
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  };
}

function tail(value: string, maxLength = 4000) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(value.length - maxLength);
}

main().catch((error) => {
  console.error("[sandbox:snapshot] failed");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
