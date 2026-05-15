import { NextResponse } from "next/server";

import { getStoreJob } from "@/lib/stores/repository";
import { getLatestWorkflowRunForStore } from "@/lib/stores/workflow-runs";

type WorkflowStatusRouteContext = {
  params: Promise<{ storeId: string }>;
};

export async function GET(
  _request: Request,
  { params }: WorkflowStatusRouteContext,
) {
  const { storeId } = await params;
  const [store, workflowRun] = await Promise.all([
    getStoreJob(storeId),
    getLatestWorkflowRunForStore(storeId),
  ]);

  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Store not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    store: {
      id: store.id,
      name: store.name,
      status: store.status,
    },
    workflowRun,
  });
}
