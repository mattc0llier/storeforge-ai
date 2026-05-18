/**
 * Node.js job script executed inside the Vercel Sandbox Commerce workspace.
 *
 * Keep this as a standalone generated script so the StoreForge runner can
 * focus on orchestration instead of embedding the sandbox implementation.
 */
export function buildSandboxJobScript() {
  return String.raw`import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
const shouldDeployGeneratedStore =
  process.env.STOREFORGE_DEPLOYMENT_ENABLED === 'true';
const livePreviewEnabled =
  process.env.STOREFORGE_LIVE_PREVIEW_ENABLED === 'true' &&
  Boolean(process.env.STOREFORGE_PREVIEW_URL);
const previewUrl = process.env.STOREFORGE_PREVIEW_URL || null;
const previewPort = Number(process.env.STOREFORGE_PREVIEW_PORT || '3000');
let previewStatus = livePreviewEnabled ? 'queued' : 'disabled';
let previewError = null;

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
    artifactMetadata: buildArtifactMetadata(),
  });
  await emitEvent('workspace', 'running', 'Checking Commerce dependencies');
  const install = await ensureDependencies();
  await startPreviewServer();
  await patchWorkflowRun({
    currentStep: 'products',
    logsSummary: summarizeLines([
      'Sandbox generation job started',
      summarizeCommand(install),
      previewUrl ? 'Preview URL: ' + previewUrl : 'Live preview disabled',
    ]),
    artifactMetadata: buildArtifactMetadata(),
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
  const deploymentResult = verification.ok
    ? await publishGeneratedStore({ modifiedFiles, generatedDiff })
    : null;

  await patchWorkflowRun({
    status: verification.ok ? 'succeeded' : 'failed',
    currentStep: verification.ok ? 'completed' : 'failed',
    repairCount: repairAttemptsUsed,
    logsSummary: summarizeLines(logsSummary),
    modifiedFilesSummary,
    codexActivitySummary: summarizeLines(codexActivity),
    workspacePath: WORKSPACE,
    artifactMetadata: buildArtifactMetadata({
      buildResult: verification.ok ? 'passed' : 'failed',
      commandResults,
      failedCommandOutput: verification.failedCommand
        ? serializeCommandResult(verification.failedCommand)
        : null,
      modifiedFiles,
      generatedDiff,
      generatedRepository: deploymentResult?.repository ?? null,
      vercelProject: deploymentResult?.project ?? null,
      vercelDeployment: deploymentResult?.deployment ?? null,
    }),
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

  await patchStoreStatus(
    verification.ok
      ? deploymentResult?.deployment?.status === 'ready'
        ? 'deployed'
        : 'generated'
      : 'failed',
  );

  if (!verification.ok) {
    throw new Error(
      'Commerce verification failed after ' + repairAttemptsUsed + ' repair attempts',
    );
  }
}

async function startPreviewServer() {
  if (!livePreviewEnabled || !previewUrl) {
    return;
  }

  previewStatus = 'running';
  await patchWorkflowRun({
    currentStep: 'preview',
    logsSummary: ['Starting Commerce live preview'],
    artifactMetadata: buildArtifactMetadata(),
  });
  await emitEvent('preview', 'running', 'Starting Commerce live preview', {
    previewUrl,
    previewPort,
  });

  const command =
    PNPM +
    ' dev --hostname 0.0.0.0 --port ' +
    String(previewPort);
  const child = spawn('bash', ['-lc', command], {
    cwd: WORKSPACE,
    detached: true,
    env: buildCommandEnv({
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      SITE_NAME: blueprint.storeName,
      COMPANY_NAME: blueprint.storeName,
      SHOPIFY_REVALIDATION_SECRET: 'storeforge-preview',
      SHOPIFY_STORE_DOMAIN: '',
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: '',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exitCode = null;
  let previewOutput = '';

  child.once('exit', (code) => {
    exitCode = code;
  });
  child.stdout?.on('data', (chunk) => {
    previewOutput = tail(previewOutput + chunk.toString('utf8'), 4000);
  });
  child.stderr?.on('data', (chunk) => {
    previewOutput = tail(previewOutput + chunk.toString('utf8'), 4000);
  });
  child.unref();

  const localUrl = 'http://127.0.0.1:' + String(previewPort);
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (exitCode !== null) {
      previewStatus = 'failed';
      previewError =
        'Preview dev server exited early with code ' +
        String(exitCode) +
        (previewOutput ? '\n' + previewOutput : '');
      await patchWorkflowRun({ artifactMetadata: buildArtifactMetadata() });
      await emitEvent('preview', 'failed', previewError, { previewUrl });
      return;
    }

    try {
      const response = await fetch(localUrl, { method: 'GET' });

      if (response.status < 500) {
        previewStatus = 'running';
        previewError = null;
        await patchWorkflowRun({ artifactMetadata: buildArtifactMetadata() });
        await emitEvent('preview', 'succeeded', 'Commerce live preview ready', {
          previewUrl,
        });
        return;
      }
    } catch {
      // Next.js may still be compiling; keep polling until the preview timeout.
    }

    await sleep(1000);
  }

  previewStatus = 'failed';
  previewError =
    'Preview dev server did not respond within 60 seconds' +
    (previewOutput ? '\n' + previewOutput : '');
  await patchWorkflowRun({ artifactMetadata: buildArtifactMetadata() });
  await emitEvent('preview', 'failed', previewError, { previewUrl });
}

function buildArtifactMetadata(extra = {}) {
  return {
    productAssets,
    heroImagePrompt: blueprint.heroImagePrompt,
    sandboxWorkspacePath: WORKSPACE,
    previewUrl,
    previewPort: livePreviewEnabled ? previewPort : null,
    previewStatus,
    previewError,
    ...extra,
  };
}

async function publishGeneratedStore({ modifiedFiles, generatedDiff }) {
  // Keep this publishing implementation self-contained: it executes inside the
  // sandbox as plain Node.js, while the StoreForge app owns the typed
  // publishing configuration in src/lib/store-generation/publishing-config.ts.
  if (!shouldDeployGeneratedStore) {
    await emitEvent(
      'preparing_deployment',
      'succeeded',
      'Deployment disabled; generated repository artifact metadata persisted',
    );
    return null;
  }

  const githubToken = requiredEnv('GITHUB_TOKEN');
  const githubOwner = requiredEnv('STOREFORGE_GITHUB_OWNER');
  const githubOwnerType = process.env.STOREFORGE_GITHUB_OWNER_TYPE || 'user';
  const visibility = process.env.STOREFORGE_GITHUB_REPO_VISIBILITY || 'private';
  const vercelToken = requiredEnv('VERCEL_TOKEN');
  const repoName = await createUniqueRepositoryName({
    owner: githubOwner,
    token: githubToken,
  });

  await patchStoreStatus('deploying');
  await patchWorkflowRun({
    currentStep: 'repo',
    artifactMetadata: buildArtifactMetadata({
      buildResult: 'passed',
      modifiedFiles,
      generatedDiff,
      deploymentEnabled: true,
      repositoryName: repoName,
    }),
  });
  await emitEvent('repo', 'running', 'Creating GitHub repository');

  const repository = await createGitHubRepository({
    owner: githubOwner,
    ownerType: githubOwnerType,
    token: githubToken,
    repoName,
    visibility,
  });

  await patchStoreRepository(repository);
  await emitEvent(
    'repo',
    'running',
    'Pushing generated code to GitHub',
    { repository: repository.fullName },
  );
  await pushWorkspaceToGitHub({
    token: githubToken,
    owner: repository.owner,
    repoName: repository.name,
  });
  await emitEvent('repo', 'succeeded', 'Generated code pushed to GitHub', {
    repositoryUrl: repository.url,
  });

  await patchWorkflowRun({
    currentStep: 'deployment',
    artifactMetadata: buildArtifactMetadata({
      buildResult: 'passed',
      modifiedFiles,
      generatedDiff,
      generatedRepository: repository,
    }),
  });
  await emitEvent('deployment', 'running', 'Creating Vercel project');

  const project = await createVercelProject({
    token: vercelToken,
    teamId: process.env.VERCEL_TEAM_ID,
    projectName: repoName,
    repository,
  });
  await emitEvent('deployment', 'running', 'Triggering production deployment', {
    projectId: project.id,
  });

  const deployment = await createVercelDeployment({
    token: vercelToken,
    teamId: process.env.VERCEL_TEAM_ID,
    project,
    repository,
  });
  const deploymentRecordId = await createDeploymentMetadata({
    project,
    deployment,
    status: 'building',
  });
  await emitEvent('deployment', 'running', 'Waiting for production deployment', {
    deploymentUrl: getDeploymentUrl(deployment),
  });
  const readyDeployment = await waitForVercelDeployment({
    token: vercelToken,
    teamId: process.env.VERCEL_TEAM_ID,
    deployment,
  });
  const deploymentStatus =
    readyDeployment.readyState === 'READY' ? 'ready' : 'error';
  const productionUrl = getDeploymentUrl(readyDeployment) || deployment.url;

  await updateDeploymentMetadata(deploymentRecordId, {
    vercel_deployment_id: readyDeployment.id || deployment.id,
    deployment_url: productionUrl,
    production_url: productionUrl,
    status: deploymentStatus,
    updated_at: new Date().toISOString(),
  });

  if (deploymentStatus !== 'ready') {
    await emitEvent('deployment', 'failed', 'Vercel deployment failed', {
      deploymentId: readyDeployment.id || deployment.id,
      readyState: readyDeployment.readyState,
    });
    throw new Error(
      'Vercel deployment failed with state ' +
        String(readyDeployment.readyState || 'unknown'),
    );
  }

  await emitEvent('deployment', 'succeeded', 'Production deployment ready', {
    deploymentUrl: productionUrl,
    projectId: project.id,
  });

  return {
    repository,
    project: {
      id: project.id,
      name: project.name,
      url: 'https://vercel.com/' + project.name,
    },
    deployment: {
      id: readyDeployment.id || deployment.id,
      url: productionUrl,
      status: deploymentStatus,
    },
  };
}

async function createUniqueRepositoryName({ owner, token }) {
  const baseName = normalizeRepoName(
    'storeforge-' + slugify(blueprint.storeName || 'store') + '-' + storeId.slice(0, 8),
  );

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 ? baseName : baseName + '-' + attempt;
    const response = await fetch(
      'https://api.github.com/repos/' + owner + '/' + candidate,
      {
        headers: githubHeaders(token),
      },
    );

    if (response.status === 404) {
      return candidate;
    }

    if (response.ok) {
      continue;
    }

    throw new Error(
      'Failed to check GitHub repository name: ' +
        response.status +
        ' ' +
        (await response.text()),
    );
  }

  return baseName + '-' + Date.now().toString(36);
}

async function createGitHubRepository({
  owner,
  ownerType,
  token,
  repoName,
  visibility,
}) {
  const endpoint =
    ownerType === 'org'
      ? 'https://api.github.com/orgs/' + owner + '/repos'
      : 'https://api.github.com/user/repos';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({
      name: repoName,
      private: visibility !== 'public',
      auto_init: false,
      description:
        'Generated StoreForge Commerce storefront for ' + blueprint.storeName,
    }),
  });

  if (!response.ok) {
    throw new Error(
      'Failed to create GitHub repository: ' +
        response.status +
        ' ' +
        sanitizeSecrets(await response.text()),
    );
  }

  const repo = await response.json();

  return {
    owner: repo.owner?.login || owner,
    name: repo.name || repoName,
    fullName: repo.full_name || owner + '/' + repoName,
    url: repo.html_url || 'https://github.com/' + owner + '/' + repoName,
    repoId: repo.id,
  };
}

async function pushWorkspaceToGitHub({ token, owner, repoName }) {
  await runCommand('rm -rf .git', { timeoutMs: 30_000 });
  await runCommand('git init -b main', { timeoutMs: 30_000 });
  await runCommand('git config user.name "StoreForge AI"', { timeoutMs: 30_000 });
  await runCommand('git config user.email "storeforge@example.com"', {
    timeoutMs: 30_000,
  });
  await runCommand('git add .', { timeoutMs: 120_000 });
  await runCommand('git commit -m "Generate StoreForge storefront"', {
    timeoutMs: 120_000,
  });

  const remoteUrl =
    'https://x-access-token:' +
    encodeURIComponent(token) +
    '@github.com/' +
    owner +
    '/' +
    repoName +
    '.git';
  const push = await runCommand('git push ' + shellQuote(remoteUrl) + ' main', {
    env: {},
    timeoutMs: 300_000,
    redact: [token, encodeURIComponent(token)],
  });

  if (push.exitCode !== 0) {
    throw new Error('Failed to push generated repository: ' + summarizeCommand(push));
  }
}

async function createVercelProject({ token, teamId, projectName, repository }) {
  const response = await fetch(
    withVercelTeam('https://api.vercel.com/v11/projects', teamId),
    {
      method: 'POST',
      headers: vercelHeaders(token),
      body: JSON.stringify({
        name: projectName,
        framework: 'nextjs',
        gitRepository: {
          type: 'github',
          repo: repository.fullName,
        },
        installCommand: 'pnpm install',
        buildCommand: 'pnpm build',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      'Failed to create Vercel project: ' +
        response.status +
        ' ' +
        sanitizeSecrets(await response.text()),
    );
  }

  return response.json();
}

async function createVercelDeployment({ token, teamId, project, repository }) {
  const response = await fetch(
    withVercelTeam(
      'https://api.vercel.com/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1',
      teamId,
    ),
    {
      method: 'POST',
      headers: vercelHeaders(token),
      body: JSON.stringify({
        name: project.name,
        project: project.id,
        target: 'production',
        gitSource: {
          type: 'github',
          repoId: repository.repoId,
          ref: 'main',
        },
        meta: {
          storeforgeStoreId: storeId,
          storeforgeWorkflowRunId: workflowRunId,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      'Failed to create Vercel deployment: ' +
        response.status +
        ' ' +
        sanitizeSecrets(await response.text()),
    );
  }

  return response.json();
}

async function waitForVercelDeployment({ token, teamId, deployment }) {
  let latest = deployment;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = latest.readyState || latest.ready_state;

    if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') {
      return latest;
    }

    await sleep(3000);

    const response = await fetch(
      withVercelTeam(
        'https://api.vercel.com/v13/deployments/' + (deployment.id || deployment.uid),
        teamId,
      ),
      { headers: vercelHeaders(token) },
    );

    if (!response.ok) {
      throw new Error(
        'Failed to poll Vercel deployment: ' +
          response.status +
          ' ' +
          sanitizeSecrets(await response.text()),
      );
    }

    latest = await response.json();
  }

  return latest;
}

async function createDeploymentMetadata({ project, deployment, status }) {
  const id = randomUUID();
  const deploymentUrl = getDeploymentUrl(deployment);

  await supabaseInsert('/rest/v1/deployment_metadata', {
    id,
    store_id: storeId,
    vercel_project_id: project.id,
    vercel_deployment_id: deployment.id || deployment.uid || null,
    deployment_url: deploymentUrl,
    preview_url: deploymentUrl,
    production_url: null,
    environment: 'production',
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return id;
}

async function updateDeploymentMetadata(id, patch) {
  await supabasePatch('/rest/v1/deployment_metadata?id=eq.' + id, patch);
}

async function patchStoreRepository(repository) {
  await supabasePatch('/rest/v1/stores?id=eq.' + storeId, {
    generated_repo_owner: repository.owner,
    generated_repo_name: repository.name,
    generated_repo_full_name: repository.fullName,
    updated_at: new Date().toISOString(),
  });
}

function getDeploymentUrl(deployment) {
  const url = deployment.alias?.[0] || deployment.url;

  if (!url) {
    return null;
  }

  return url.startsWith('http') ? url : 'https://' + url;
}

function githubHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'storeforge-ai',
  };
}

function vercelHeaders(token) {
  return {
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
  };
}

function withVercelTeam(url, teamId) {
  if (!teamId) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return url + separator + 'teamId=' + encodeURIComponent(teamId);
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
  const commandEnv = buildCommandEnv(options.env);
  const displayCommand = redactSecrets(command, options.redact);

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      cwd: WORKSPACE,
      env: commandEnv,
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
        command: displayCommand,
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
      const text = redactSecrets(chunk.toString('utf8'), options.redact);
      stdoutChunks.push(Buffer.from(text));
      handleStdoutText(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = redactSecrets(chunk.toString('utf8'), options.redact);
      stderrChunks.push(Buffer.from(text));
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
        command: displayCommand,
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function buildCommandEnv(env = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    SHELL: process.env.SHELL,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TERM: process.env.TERM,
    CI: process.env.CI || '1',
    ...env,
  };
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

function slugify(value) {
  return String(value || 'store')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeRepoName(value) {
  return slugify(value).slice(0, 90) || 'storeforge-store';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeSecrets(value) {
  let output = String(value ?? '');
  const secrets = [
    process.env.GITHUB_TOKEN,
    process.env.VERCEL_TOKEN,
    process.env.CODEX_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean);

  for (const secret of secrets) {
    output = output.replaceAll(secret, '[redacted]');
    output = output.replaceAll(encodeURIComponent(secret), '[redacted]');
  }

  return output;
}

function redactSecrets(value, extraSecrets = []) {
  let output = sanitizeSecrets(value);

  for (const secret of extraSecrets.filter(Boolean)) {
    output = output.replaceAll(secret, '[redacted]');
  }

  return output;
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
