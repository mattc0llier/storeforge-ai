"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleX,
  Rocket,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { WorkflowRun } from "@/lib/db/schema";

type WorkflowStatusPayload = {
  ok: true;
  store: {
    id: string;
    name: string;
    status: string;
  };
  workflowRun: WorkflowRun | null;
};

type WorkflowStatusPanelProps = {
  storeId: string;
  initialWorkflowRun: WorkflowRun | null;
};

const generationSteps = [
  {
    id: "workspace",
    label: "Workspace prepared",
    detail: "Clone Commerce, install dependencies, and initialize workspace.",
  },
  {
    id: "products",
    label: "Products generated",
    detail: "Prepare product metadata and placeholder asset URLs.",
  },
  {
    id: "codex",
    label: "Codex transforming storefront",
    detail: "Apply bounded branding, catalog, content, and theme changes.",
  },
  {
    id: "build",
    label: "Running build",
    detail: "Run Commerce build and test validation.",
  },
  {
    id: "repair",
    label: "Repairing build issues",
    detail: "Allow up to two focused Codex repairs when validation fails.",
  },
  {
    id: "preparing_deployment",
    label: "Preparing deployment",
    detail: "Persist artifact metadata for the later Vercel deployment step.",
  },
];

export function WorkflowStatusPanel({
  storeId,
  initialWorkflowRun,
}: WorkflowStatusPanelProps) {
  const [workflowRun, setWorkflowRun] = useState(initialWorkflowRun);

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
        setWorkflowRun(payload.workflowRun);
      }
    }

    const interval = window.setInterval(() => {
      if (
        workflowRun?.status !== "succeeded" &&
        workflowRun?.status !== "failed" &&
        workflowRun?.status !== "canceled"
      ) {
        void refresh();
      }
    }, 2000);

    void refresh();

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [storeId, workflowRun?.status]);

  const stepStates = useMemo(() => {
    return getStepStates(workflowRun);
  }, [workflowRun]);

  const modifiedFiles = getArtifactStringArray(workflowRun, "modifiedFiles");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="size-5" />
            Generation Timeline
          </CardTitle>
          <CardDescription>
            StoreForge is running a bounded Commerce repository transformation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          {generationSteps.map((step, index) => {
            const state = stepStates[step.id] ?? "pending";

            return (
              <div key={step.id}>
                <div className="flex gap-4 py-4">
                  <div className="pt-0.5">{renderStepIcon(state)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{step.label}</p>
                      <Badge variant={state === "failed" ? "destructive" : "secondary"}>
                        {state}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </div>
                {index < generationSteps.length - 1 ? <Separator /> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Technical Details</CardTitle>
          <CardDescription>
            Concise run metadata for debugging without crowding the default
            approval flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DetailRow label="Workflow status" value={workflowRun?.status ?? "not started"} />
          <DetailRow label="Current step" value={workflowRun?.currentStep ?? "queued"} />
          <DetailRow
            label="Repair attempts"
            value={String(workflowRun?.repairCount ?? 0)}
          />
          <DetailRow label="Run ID" value={workflowRun?.providerRunId ?? "pending"} />
          <DetailRow
            label="Workspace"
            value={workflowRun?.workspacePath ?? "pending"}
          />

          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Modified files
            </summary>
            <PreformattedList
              empty="No modified files captured yet."
              items={modifiedFiles.length ? modifiedFiles : workflowRun?.modifiedFilesSummary}
            />
          </details>

          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Build logs
            </summary>
            <PreformattedList
              empty="Build logs will appear after validation starts."
              items={workflowRun?.logsSummary}
            />
          </details>

          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Codex activity summaries
            </summary>
            <PreformattedList
              empty="Codex activity will appear once transformation starts."
              items={workflowRun?.codexActivitySummary}
            />
          </details>

          {workflowRun?.errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {workflowRun.errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function getStepStates(workflowRun: WorkflowRun | null) {
  const states: Record<string, "pending" | "running" | "complete" | "failed" | "skipped"> = {};

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
        step.id === "repair" && workflowRun.repairCount === 0
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
    if (step.id === "repair" && workflowRun.repairCount === 0 && currentIndex > index) {
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
    return <CheckCircle2 className="size-5 text-emerald-400" />;
  }

  if (state === "failed") {
    return <CircleX className="size-5 text-destructive" />;
  }

  if (state === "running") {
    return <CircleDot className="size-5 text-amber-300" />;
  }

  return <CircleDashed className="size-5 text-muted-foreground" />;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-[160px_1fr]">
      <p className="font-medium">{label}</p>
      <p className="break-words text-muted-foreground">{value}</p>
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
    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
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
