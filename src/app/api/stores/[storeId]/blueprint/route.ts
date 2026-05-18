import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  parseBlueprintGenerationPhase,
  runBlueprintGenerationPhase,
} from "@/lib/store-generation/blueprint-workflow";
import { getStoreJob } from "@/lib/stores/repository";
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

  try {
    const phase = parseBlueprintGenerationPhase(
      new URL(request.url).searchParams.get("phase"),
    );
    const result = await runBlueprintGenerationPhase({
      phase,
      store,
    });

    revalidatePath(`/stores/${storeId}`);
    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      ...result,
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
