import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { startStoreGenerationWorkflow } from "@/lib/store-generation/launch-workflow";

type LaunchStoreRouteContext = {
  params: Promise<{ storeId: string }>;
};

export async function POST(
  _request: Request,
  { params }: LaunchStoreRouteContext,
) {
  const { storeId } = await params;
  const userId = await getCurrentUserId();

  try {
    const { workflowRun } = await startStoreGenerationWorkflow({
      storeId,
      userId,
    });

    return NextResponse.json(
      {
        ok: true,
        statusUrl: `/stores/${storeId}/status`,
        workflowRunId: workflowRun.id,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start store generation.",
      },
      { status: userId ? 400 : 401 },
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
