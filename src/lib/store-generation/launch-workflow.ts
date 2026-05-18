import { after } from "next/server";

import { runStoreGeneration } from "@/lib/store-generation/generation-runner";
import type { StoreBlueprint } from "@/lib/store-generation/store-blueprint";
import { getStoreJob } from "@/lib/stores/repository";
import {
  createGenerationWorkflowRun,
  getLatestWorkflowRunForStore,
  updateWorkflowRun,
} from "@/lib/stores/workflow-runs";

export async function startStoreGenerationWorkflow({
  storeId,
  userId,
}: {
  storeId: string;
  userId: string | null;
}) {
  const store = await getStoreJob(storeId);

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  if (!userId) {
    throw new Error("Sign in before generating this store.");
  }

  if (store.clerkUserId !== userId) {
    throw new Error("You do not have access to launch this store.");
  }

  const latestRun = await getLatestWorkflowRunForStore(storeId);

  if (latestRun?.status === "running" || latestRun?.status === "queued") {
    return {
      store,
      workflowRun: latestRun,
    };
  }

  if (!hasGeneratedProductImages(store.blueprint)) {
    throw new Error(
      "Generate product images before creating the final Commerce store.",
    );
  }

  const workflowRun = await createGenerationWorkflowRun(storeId);

  try {
    await updateWorkflowRun(workflowRun.id, {
      providerRunId: workflowRun.id,
      status: "running",
      currentStep: "queued",
    });

    after(async () => {
      try {
        await runStoreGeneration({
          storeId,
          workflowRunId: workflowRun.id,
        });
      } catch (error) {
        console.error("[store-generation] background job failed", error);
        await updateWorkflowRun(workflowRun.id, {
          status: "failed",
          currentStep: "failed",
          completedAt: new Date().toISOString(),
          errorMessage:
            error instanceof Error
              ? error.message
              : "Store generation failed.",
        });
      }
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

  return {
    store,
    workflowRun,
  };
}

function hasGeneratedProductImages(blueprint: StoreBlueprint) {
  return blueprint.products.every((product) =>
    product.imageUrl.includes("blob.vercel-storage.com"),
  );
}
