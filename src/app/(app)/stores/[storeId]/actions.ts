"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { runStoreGeneration } from "@/lib/store-generation/generation-runner";
import { regenerateProductConcept } from "@/lib/store-generation/blueprint-generator";
import { generateAndUploadBlueprintImages } from "@/lib/store-generation/image-assets";
import type { StoreBlueprint } from "@/lib/store-generation/store-blueprint";
import { getStoreJob, updateStoreBlueprint } from "@/lib/stores/repository";
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

  redirect(`/stores/${storeId}/status`);
}

export async function regenerateProductConceptAction(storeId: string) {
  const store = await getStoreJob(storeId);

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  const userId = await getCurrentUserId();

  if (userId && store.clerkUserId !== userId) {
    throw new Error("You do not have access to update this store.");
  }

  const latestRun = await getLatestWorkflowRunForStore(storeId);

  if (latestRun?.status === "running" || latestRun?.status === "queued") {
    redirect(`/stores/${storeId}/status`);
  }

  const blueprint = await regenerateProductConcept({
    originalPrompt: store.originalPrompt,
    currentBlueprint: store.blueprint,
  });

  await updateStoreBlueprint({
    storeId,
    blueprint,
  });

  revalidatePath(`/stores/${storeId}`);
}

export async function generateProductImagesAction(storeId: string) {
  const store = await getStoreJob(storeId);

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  const userId = await getCurrentUserId();

  if (userId && store.clerkUserId !== userId) {
    throw new Error("You do not have access to update this store.");
  }

  const latestRun = await getLatestWorkflowRunForStore(storeId);

  if (latestRun?.status === "running" || latestRun?.status === "queued") {
    redirect(`/stores/${storeId}/status`);
  }

  const blueprint = await generateAndUploadBlueprintImages({
    storeId,
    blueprint: store.blueprint,
  });

  await updateStoreBlueprint({
    storeId,
    blueprint,
  });

  revalidatePath(`/stores/${storeId}`);
}

function hasGeneratedProductImages(blueprint: StoreBlueprint) {
  return blueprint.products.every((product) =>
    product.imageUrl.includes("blob.vercel-storage.com"),
  );
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
