"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  CircleX,
  ExternalLink,
  GitBranch,
  Globe2,
  Loader2,
  Monitor,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkflowEvent, WorkflowRun } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type WorkflowStatusPayload = {
  ok: true;
  store: {
    id: string;
    name: string;
    status: string;
  };
  workflowRun: WorkflowRun | null;
  workflowEvents: WorkflowEvent[];
};

type WorkflowStatusPanelProps = {
  storeId: string;
  initialStoreName: string;
  initialStoreStatus: string;
  initialWorkflowRun: WorkflowRun | null;
  initialWorkflowEvents: WorkflowEvent[];
};

const generationSteps = [
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
];

export function WorkflowStatusPanel({
  storeId,
  initialStoreName,
  initialStoreStatus,
  initialWorkflowEvents,
  initialWorkflowRun,
}: WorkflowStatusPanelProps) {
  const [store, setStore] = useState({
    id: storeId,
    name: initialStoreName,
    status: initialStoreStatus,
  });
  const [workflowRun, setWorkflowRun] = useState(initialWorkflowRun);
  const [workflowEvents, setWorkflowEvents] = useState(initialWorkflowEvents);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function refresh() {
      const response = await fetch(`/api/stores/${storeId}/workflow-status`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as WorkflowStatusPayload;

      if (active) {
        setStore(payload.store);
        setWorkflowRun(payload.workflowRun);
        setWorkflowEvents(payload.workflowEvents);
      }
    }

    const interval = window.setInterval(() => {
      if (!isTerminalWorkflowStatus(workflowRun?.status)) {
        void refresh();
      }
    }, 2000);

    void refresh();

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [storeId, workflowRun?.status]);

  const previewUrl = getArtifactString(workflowRun, "previewUrl");
  const previewStatus =
    getArtifactString(workflowRun, "previewStatus") ||
    (previewUrl ? "queued" : "pending");
  const previewError = getArtifactString(workflowRun, "previewError");
  const modifiedFiles = getArtifactStringArray(workflowRun, "modifiedFiles");
  const generatedDiff = getArtifactString(workflowRun, "generatedDiff");
  const failedCommandOutput = getFailedCommandOutput(workflowRun);
  const timing = getWorkflowTiming(workflowEvents);
  const generatedRepository = getArtifactRecord(
    workflowRun,
    "generatedRepository",
  );
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
    generatedRepository !== null ||
    getArtifactBoolean(workflowRun, "deploymentEnabled");
  const stepStates = useMemo(() => {
    return getStepStates(workflowRun, deploymentEnabled);
  }, [deploymentEnabled, workflowRun]);

  useEffect(() => {
    if (!visiblePreviewUrl || isTerminalWorkflowStatus(workflowRun?.status)) {
      return;
    }

    const interval = window.setInterval(() => {
      setPreviewRefreshKey((value) => value + 1);
    }, 12000);

    return () => window.clearInterval(interval);
  }, [visiblePreviewUrl, workflowRun?.status]);

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm lg:grid lg:h-[calc(100vh-8rem)] lg:min-h-[760px] lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b bg-muted/20 lg:border-b-0 lg:border-r">
        <div className="space-y-4 border-b bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Store {store.id.slice(0, 8)}</Badge>
              </div>
              <h1 className="mt-3 truncate text-2xl font-semibold">
                {store.name}
              </h1>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Elapsed" value={timing.elapsedLabel} />
            <Metric label="Events" value={String(workflowEvents.length)} />
            <Metric
              label="Repairs"
              value={String(workflowRun?.repairCount ?? 0)}
            />
          </div>
          {repositoryUrl || liveDeploymentUrl ? (
            <div className="grid gap-2">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Generated output
              </p>
              <div className="flex flex-wrap gap-2">
                {repositoryUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={repositoryUrl} rel="noreferrer" target="_blank">
                      <GitBranch className="size-4" />
                      GitHub repo
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                {liveDeploymentUrl ? (
                  <Button asChild size="sm" variant="default">
                    <a href={liveDeploymentUrl} rel="noreferrer" target="_blank">
                      <Globe2 className="size-4" />
                      Live store
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
              </div>
              {repositoryName ? (
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {repositoryName}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Generation</h2>
              <Badge variant="outline">
                {workflowRun?.currentStep ?? "queued"}
              </Badge>
            </div>
            <div className="space-y-1">
              {generationSteps.map((step) => {
                const state = stepStates[step.id] ?? "pending";

                return (
                  <div
                    className={cn(
                      "grid grid-cols-[24px_1fr] gap-3 rounded-md px-2 py-2",
                      state === "running" && "bg-muted",
                    )}
                    key={step.id}
                  >
                    <div className="pt-0.5">{renderStepIcon(state)}</div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {step.label}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {state}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <details className="rounded-md border bg-background">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span>Activity</span>
              <Badge variant="secondary">{workflowEvents.length} events</Badge>
            </summary>
            <div className="space-y-2 border-t p-3">
              {workflowEvents.length ? (
                workflowEvents
                  .slice(-18)
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
                  .reverse()
                  .map(({ delta, event }) => {
                    return (
                      <div className="rounded-md border p-3" key={event.id}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {formatTime(event.createdAt)}
                          </p>
                          <Badge
                            variant={
                              event.status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {delta}
                          </Badge>
                        </div>
                        <p className="mt-2 break-words text-sm font-medium leading-5 [overflow-wrap:anywhere]">
                          {event.message}
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                          {event.eventName}
                        </p>
                      </div>
                    );
                  })
              ) : (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  Workflow events will appear when generation starts.
                </p>
              )}
            </div>
          </details>

          <details className="rounded-md border bg-background">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span>Technical details</span>
              <Badge variant="outline">
                {workflowRun?.status ?? "pending"}
              </Badge>
            </summary>
            <div className="space-y-3 border-t p-3">
              <DetailRow
                label="Run"
                value={workflowRun?.providerRunId ?? workflowRun?.id ?? "pending"}
              />
              <DetailRow
                label="Workspace"
                value={workflowRun?.workspacePath ?? "pending"}
              />
              <ArtifactLink
                href={getRecordString(generatedRepository, "url")}
                label="GitHub"
                value={
                  getRecordString(generatedRepository, "fullName") ?? "pending"
                }
              />
              <ArtifactLink
                href={getRecordString(vercelProject, "url")}
                label="Vercel"
                value={getRecordString(vercelProject, "name") ?? "pending"}
              />

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Modified files
                </summary>
                <PreformattedList
                  empty="No modified files captured yet."
                  items={
                    modifiedFiles.length
                      ? modifiedFiles
                      : workflowRun?.modifiedFilesSummary
                  }
                />
              </details>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Build logs
                </summary>
                <PreformattedList
                  empty="Build logs will appear after validation starts."
                  items={workflowRun?.logsSummary}
                />
              </details>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Codex activity
                </summary>
                <PreformattedList
                  empty="Codex activity will appear once transformation starts."
                  items={workflowRun?.codexActivitySummary}
                />
              </details>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Generated diff
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs leading-5 text-muted-foreground">
                  {generatedDiff ||
                    "Generated code diff will appear after the next successful transformation."}
                </pre>
              </details>

              {failedCommandOutput ? (
                <details className="rounded-md border border-destructive/40 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-destructive">
                    Failed command output
                  </summary>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-destructive/10 p-3 text-xs leading-5 text-destructive">
                    {failedCommandOutput}
                  </pre>
                </details>
              ) : null}

              {workflowRun?.errorMessage ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {workflowRun.errorMessage}
                </p>
              ) : null}
            </div>
          </details>
        </div>
      </aside>

      <PreviewWorkspace
        liveDeploymentUrl={liveDeploymentUrl}
        previewError={previewError}
        previewRefreshKey={previewRefreshKey}
        previewStatus={previewStatus}
        previewUrl={visiblePreviewUrl}
        rawPreviewUrl={previewUrl}
        workflowStatus={workflowRun?.status ?? "queued"}
        onRefresh={() => setPreviewRefreshKey((value) => value + 1)}
      />
    </div>
  );
}

function PreviewWorkspace({
  liveDeploymentUrl,
  onRefresh,
  previewError,
  previewRefreshKey,
  previewStatus,
  previewUrl,
  rawPreviewUrl,
  workflowStatus,
}: {
  liveDeploymentUrl: string | null;
  onRefresh: () => void;
  previewError: string;
  previewRefreshKey: number;
  previewStatus: string;
  previewUrl: string;
  rawPreviewUrl: string;
  workflowStatus: string;
}) {
  const frameUrl = previewUrl
    ? buildPreviewFrameUrl(previewUrl, previewRefreshKey)
    : "";
  const isLiveDeployment = Boolean(liveDeploymentUrl && previewUrl === liveDeploymentUrl);
  const isTerminal = isTerminalWorkflowStatus(workflowStatus);
  const missingPreview = isTerminal && !previewUrl;
  const isPreviewReady =
    Boolean(previewUrl) &&
    (previewStatus === "running" ||
      previewStatus === "succeeded" ||
      isLiveDeployment);

  return (
    <section className="flex min-h-[640px] min-w-0 flex-col bg-[#f7f7f7]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="size-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {isLiveDeployment ? "Production store" : "Live sandbox preview"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {previewUrl ||
                (previewStatus === "failed"
                  ? "Preview unavailable"
                  : "Preparing Commerce preview")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              previewStatus === "failed"
                ? "destructive"
                : isPreviewReady
                  ? "secondary"
                  : "outline"
            }
            className="sr-only"
          >
            {isLiveDeployment ? "deployed" : previewStatus}
          </Badge>
          <Button
            aria-label="Reload preview"
            disabled={!previewUrl}
            onClick={onRefresh}
            size="icon-sm"
            type="button"
            variant="secondary"
          >
            <RefreshCw className="size-4" />
          </Button>
          {previewUrl ? (
            <Button asChild size="sm" variant="default">
              <a href={previewUrl} rel="noreferrer" target="_blank">
                {isLiveDeployment ? "Open live store" : "Open preview"}
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full min-h-[580px] flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="flex h-11 items-center gap-2 border-b px-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="mx-auto flex max-w-xl flex-1 items-center justify-center rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
              <span className="truncate">
                {previewUrl ||
                  (missingPreview
                    ? "No sandbox preview was created for this run"
                    : "Waiting for sandbox preview")}
              </span>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 bg-white">
            {isPreviewReady ? (
              <iframe
                allow="clipboard-read; clipboard-write; fullscreen"
                className="h-full min-h-[540px] w-full bg-white"
                key={`${previewUrl}-${previewRefreshKey}`}
                loading="eager"
                referrerPolicy="no-referrer-when-downgrade"
                src={frameUrl}
                title="StoreForge live storefront preview"
              />
            ) : (
              <div className="flex h-full min-h-[540px] flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                  {previewStatus === "failed" || missingPreview ? (
                    <CircleX className="size-6 text-destructive" />
                  ) : (
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="max-w-md space-y-2">
                  <h2 className="text-xl font-semibold">
                    {missingPreview
                      ? "Preview not available"
                      : previewStatus === "failed"
                        ? "Preview unavailable"
                        : "Preparing Commerce preview"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {missingPreview
                      ? "This generation completed before the live sandbox preview was started. Launch a new store generation to use the iframe preview path."
                      : previewStatus === "failed"
                        ? previewError ||
                          "The generation workflow is continuing without the iframe preview."
                        : "The sandbox is installing dependencies and starting the Commerce dev server."}
                  </p>
                  {rawPreviewUrl ? (
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {rawPreviewUrl}
                    </p>
                  ) : null}
                  <Badge variant="outline">workflow {workflowStatus}</Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-xs">{value}</p>
    </div>
  );
}

function ArtifactLink({
  href,
  label,
  value,
}: {
  href?: string | null;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      {href ? (
        <a
          className="mt-1 inline-flex max-w-full min-w-0 items-center gap-1 break-all font-medium underline-offset-4 hover:underline"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {value}
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : (
        <p className="mt-1 break-all text-muted-foreground">{value}</p>
      )}
    </div>
  );
}

function getStepStates(workflowRun: WorkflowRun | null, deploymentEnabled: boolean) {
  const states: Record<
    string,
    "pending" | "running" | "complete" | "failed" | "skipped"
  > = {};

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

function renderStepIcon(state: string) {
  if (state === "complete") {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }

  if (state === "failed") {
    return <CircleX className="size-4 text-destructive" />;
  }

  if (state === "running") {
    return <Loader2 className="size-4 animate-spin text-primary" />;
  }

  if (state === "skipped") {
    return <CheckCircle2 className="size-4 text-muted-foreground" />;
  }

  return <CircleDashed className="size-4 text-muted-foreground" />;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border bg-background p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function PreformattedList({
  items,
  empty,
}: {
  items?: string[];
  empty: string;
}) {
  const visibleItems = items?.filter(Boolean) ?? [];

  return (
    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
      {visibleItems.length ? visibleItems.join("\n") : empty}
    </pre>
  );
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

function getRecordString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value : null;
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

function isTerminalWorkflowStatus(status: string | null | undefined) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function buildPreviewFrameUrl(url: string, refreshKey: number) {
  if (!refreshKey) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}storeforgePreview=${refreshKey}`;
}

function formatTime(value: string) {
  return new Date(value).toISOString().slice(11, 19);
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
