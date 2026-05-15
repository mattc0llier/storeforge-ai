"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { start } from "workflow/api";

import { getStoreJob } from "@/lib/stores/repository";
import {
  createGenerationWorkflowRun,
  getLatestWorkflowRunForStore,
  updateWorkflowRun,
} from "@/lib/stores/workflow-runs";
import { generateStoreWorkflow } from "@workflows/generate-store";

export async function launchStoreAction(storeId: string) {
  const store = await getStoreJob(storeId);

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  const userId = await getCurrentUserId();

  if (userId && store.clerkUserId !== userId) {
    throw new Error("You do not have access to launch this store.");
  }

  const latestRun = await getLatestWorkflowRunForStore(storeId);

  if (latestRun?.status === "running" || latestRun?.status === "queued") {
    redirect(`/stores/${storeId}/status`);
  }

  const workflowRun = await createGenerationWorkflowRun(storeId);

  try {
    const run = await start(generateStoreWorkflow, [
      {
        storeId,
        workflowRunId: workflowRun.id,
      },
    ]);

    await updateWorkflowRun(workflowRun.id, {
      providerRunId: run.runId,
      status: "running",
      currentStep: "queued",
    });
  } catch (error) {
    await updateWorkflowRun(workflowRun.id, {
      status: "failed",
      currentStep: "failed",
      completedAt: new Date().toISOString(),
      errorMessage:
        error instanceof Error ? error.message : "Failed to start workflow.",
    });
    throw error;
  }

  redirect(`/stores/${storeId}/status`);
}

async function getCurrentUserId() {
  if (
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    !process.env.CLERK_SECRET_KEY
  ) {
    return "dev-user";
  }

  const session = await auth();

  return session.userId;
}
