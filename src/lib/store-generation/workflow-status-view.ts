import type { WorkflowEvent, WorkflowRun } from "@/lib/db/schema";

export type StepState = "pending" | "running" | "complete" | "failed" | "skipped";

export const generationSteps = [
  {
    id: "workspace",
    label: "Workspace",
    detail: "Sandbox and Commerce dependencies.",
  },
  {
    id: "preview",
    label: "Live preview",
    detail: "Run Commerce dev server in the sandbox.",
  },
  {
    id: "products",
    label: "Products",
    detail: "Prepare product metadata and assets.",
  },
  {
    id: "codex",
    label: "Codex transform",
    detail: "Apply bounded storefront changes.",
  },
  {
    id: "build",
    label: "Build validation",
    detail: "Run Commerce build and tests.",
  },
  {
    id: "repair",
    label: "Repair loop",
    detail: "Focused fixes when validation fails.",
  },
  {
    id: "preparing_deployment",
    label: "Artifact",
    detail: "Persist generated metadata.",
  },
  {
    id: "repo",
    label: "Repository",
    detail: "Push generated code to GitHub.",
  },
  {
    id: "deployment",
    label: "Production",
    detail: "Create the Vercel deployment.",
  },
] as const;

type GenerationStep = (typeof generationSteps)[number];

export type GenerationStepId = GenerationStep["id"];

export type WorkflowActivityItem = {
  delta: string;
  event: WorkflowEvent;
};

export function createWorkflowStatusView({
  workflowEvents,
  workflowRun,
}: {
  workflowEvents: WorkflowEvent[];
  workflowRun: WorkflowRun | null;
}) {
  const previewUrl = getArtifactString(workflowRun, "previewUrl");
  const previewStatus =
    getArtifactString(workflowRun, "previewStatus") ||
    (previewUrl ? "queued" : "pending");
  const previewError = getArtifactString(workflowRun, "previewError");
  const modifiedFiles = getArtifactStringArray(workflowRun, "modifiedFiles");
  const generatedDiff = getArtifactString(workflowRun, "generatedDiff");
  const failedCommandOutput = getFailedCommandOutput(workflowRun);
  const generatedRepository = getArtifactRecord(workflowRun, "generatedRepository");
  const vercelProject = getArtifactRecord(workflowRun, "vercelProject");
  const vercelDeployment = getArtifactRecord(workflowRun, "vercelDeployment");
  const liveDeploymentUrl = getRecordString(vercelDeployment, "url");
  const repositoryUrl = getRecordString(generatedRepository, "url");
  const repositoryName = getRecordString(generatedRepository, "fullName");
  const visiblePreviewUrl =
    workflowRun?.status === "succeeded" && liveDeploymentUrl
      ? liveDeploymentUrl
      : previewUrl;
  const deploymentEnabled =
    generatedRepository !== null || getArtifactBoolean(workflowRun, "deploymentEnabled");

  return {
    activityItems: getWorkflowActivityItems(workflowEvents),
    artifacts: {
      deploymentEnabled,
      failedCommandOutput,
      generatedDiff,
      generatedRepository,
      modifiedFiles,
      repositoryName,
      repositoryUrl,
      vercelDeployment,
      vercelProject,
    },
    preview: {
      isLiveDeployment: Boolean(liveDeploymentUrl && visiblePreviewUrl === liveDeploymentUrl),
      isPreviewReady:
        Boolean(visiblePreviewUrl) &&
        (previewStatus === "running" ||
          previewStatus === "succeeded" ||
          Boolean(liveDeploymentUrl && visiblePreviewUrl === liveDeploymentUrl)),
      liveDeploymentUrl,
      missingPreview: isTerminalWorkflowStatus(workflowRun?.status) && !visiblePreviewUrl,
      previewError,
      previewStatus,
      rawPreviewUrl: previewUrl,
      visiblePreviewUrl,
    },
    stepStates: getStepStates(workflowRun, deploymentEnabled),
    timing: getWorkflowTiming(workflowEvents),
  };
}

export function getWorkflowActivityItems(
  workflowEvents: WorkflowEvent[],
  limit = 18,
): WorkflowActivityItem[] {
  return workflowEvents
    .slice(-limit)
    .map((event, index, visibleEvents) => {
      const previous = visibleEvents[index - 1];
      const delta = previous
        ? formatDuration(
            new Date(event.createdAt).getTime() -
              new Date(previous.createdAt).getTime(),
          )
        : "+0s";

      return { delta, event };
    })
    .reverse();
}

export function getStepStates(
  workflowRun: WorkflowRun | null,
  deploymentEnabled: boolean,
) {
  const states: Record<GenerationStepId, StepState> = {} as Record<
    GenerationStepId,
    StepState
  >;

  if (!workflowRun) {
    for (const step of generationSteps) states[step.id] = "pending";
    return states;
  }

  if (workflowRun.status === "failed") {
    for (const step of generationSteps) states[step.id] = "pending";
    const failedStep = workflowRun.currentStep ?? "workspace";
    const failedIndex = Math.max(
      generationSteps.findIndex((step) => step.id === failedStep),
      0,
    );

    for (let index = 0; index < failedIndex; index += 1) {
      states[generationSteps[index].id] = "complete";
    }
    states[generationSteps[failedIndex].id] = "failed";
    return states;
  }

  if (workflowRun.status === "succeeded") {
    for (const step of generationSteps) {
      states[step.id] =
        (step.id === "repo" || step.id === "deployment") && !deploymentEnabled
          ? "skipped"
          : step.id === "repair" && workflowRun.repairCount === 0
            ? "skipped"
            : "complete";
    }
    return states;
  }

  const currentIndex = Math.max(
    generationSteps.findIndex((step) => step.id === workflowRun.currentStep),
    0,
  );

  for (let index = 0; index < generationSteps.length; index += 1) {
    const step = generationSteps[index];
    if (
      step.id === "repair" &&
      workflowRun.repairCount === 0 &&
      currentIndex > index
    ) {
      states[step.id] = "skipped";
    } else if (index < currentIndex) {
      states[step.id] = "complete";
    } else if (index === currentIndex) {
      states[step.id] = "running";
    } else {
      states[step.id] = "pending";
    }
  }

  return states;
}

export function getRecordString(
  record: Record<string, unknown> | null,
  key: string,
) {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

export function isTerminalWorkflowStatus(status: string | null | undefined) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

export function buildPreviewFrameUrl(url: string, refreshKey: number) {
  if (!refreshKey) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}storeforgePreview=${refreshKey}`;
}

export function formatTime(value: string) {
  return new Date(value).toISOString().slice(11, 19);
}

function getArtifactStringArray(workflowRun: WorkflowRun | null, key: string) {
  const value = workflowRun?.artifactMetadata[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getArtifactString(workflowRun: WorkflowRun | null, key: string) {
  const value = workflowRun?.artifactMetadata[key];

  return typeof value === "string" ? value : "";
}

function getArtifactBoolean(workflowRun: WorkflowRun | null, key: string) {
  const value = workflowRun?.artifactMetadata[key];

  return typeof value === "boolean" ? value : false;
}

function getArtifactRecord(workflowRun: WorkflowRun | null, key: string) {
  const value = workflowRun?.artifactMetadata[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getFailedCommandOutput(workflowRun: WorkflowRun | null) {
  const value = workflowRun?.artifactMetadata.failedCommandOutput;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const output = "output" in value ? value.output : null;

  return typeof output === "string" && output.trim() ? output : null;
}

function getWorkflowTiming(events: WorkflowEvent[]) {
  if (!events.length) {
    return { elapsedLabel: "pending" };
  }

  const startedAt = new Date(events[0].createdAt).getTime();
  const endedAt = new Date(events[events.length - 1].createdAt).getTime();

  return {
    elapsedLabel: formatDuration(endedAt - startedAt),
  };
}

function formatDuration(durationMs: number) {
  const safeDuration = Math.max(durationMs, 0);

  if (safeDuration < 1000) {
    return `+${safeDuration}ms`;
  }

  const seconds = Math.round(safeDuration / 1000);

  if (seconds < 60) {
    return `+${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return `+${minutes}m ${remainder}s`;
}
