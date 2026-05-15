"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { runStoreGeneration } from "@/lib/store-generation/generation-runner";
import { getStoreJob } from "@/lib/stores/repository";
import {
  createGenerationWorkflowRun,
  getLatestWorkflowRunForStore,
  updateWorkflowRun,
} from "@/lib/stores/workflow-runs";

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
    await updateWorkflowRun(workflowRun.id, {
      providerRunId: workflowRun.id,
      status: "running",
      currentStep: "queued",
    });

    void runStoreGeneration({
      storeId,
      workflowRunId: workflowRun.id,
    }).catch((error: unknown) => {
      console.error("[store-generation] background job failed", error);
    });
  } catch (error) {
    await updateWorkflowRun(workflowRun.id, {
      status: "failed",
      currentStep: "failed",
      completedAt: new Date().toISOString(),
      errorMessage:
        error instanceof Error ? error.message : "Failed to start generation.",
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
