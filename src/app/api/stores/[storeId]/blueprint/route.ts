import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  generateStoreBlueprint,
  generateStoreConceptBlueprint,
  regenerateProductConcept,
} from "@/lib/store-generation/blueprint-generator";
import { getStoreJob, updateStoreBlueprint } from "@/lib/stores/repository";
import { updateStoreStatus } from "@/lib/stores/workflow-runs";

type BlueprintRouteContext = {
  params: Promise<{ storeId: string }>;
};

export async function POST(request: Request, { params }: BlueprintRouteContext) {
  const { storeId } = await params;
  const store = await getStoreJob(storeId);

  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Store not found" },
      { status: 404 },
    );
  }

  const userId = await getCurrentUserId();

  if (userId && store.clerkUserId !== userId) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 403 },
    );
  }

  if (store.status !== "generating") {
    return NextResponse.json({
      ok: true,
      status: store.status,
      skipped: true,
    });
  }

  try {
    const phase = new URL(request.url).searchParams.get("phase");
    const hasConcept = store.blueprint.storeName !== "Generating Store";

    if (phase === "concept" && hasConcept) {
      return NextResponse.json({
        ok: true,
        status: store.status,
        phase,
        skipped: true,
      });
    }

    const blueprint =
      phase === "concept"
        ? await generateStoreConceptBlueprint({
            prompt: store.originalPrompt,
          })
        : phase === "catalog"
          ? await regenerateProductConcept({
              originalPrompt: store.originalPrompt,
              currentBlueprint: store.blueprint,
            })
          : await generateStoreBlueprint({
              prompt: store.originalPrompt,
            });

    const updatedStore = await updateStoreBlueprint({
      storeId,
      blueprint,
      status: phase === "concept" ? "generating" : "draft",
    });

    revalidatePath(`/stores/${storeId}`);
    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      status: updatedStore.status,
      phase: phase ?? "full",
      storeId,
    });
  } catch (error) {
    await updateStoreStatus(storeId, "failed");
    revalidatePath(`/stores/${storeId}`);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Blueprint generation failed.",
      },
      { status: 500 },
    );
  }
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
