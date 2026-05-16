import { NextResponse } from "next/server";

import { getStoreJob } from "@/lib/stores/repository";
import {
  getLatestWorkflowRunForStore,
  getWorkflowEventsForRun,
} from "@/lib/stores/workflow-runs";

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

  const workflowEvents = workflowRun
    ? await getWorkflowEventsForRun(workflowRun.id).catch((error: unknown) => {
        console.warn("[workflow-events] failed to load events", error);
        return [];
      })
    : [];

  return NextResponse.json({
    ok: true,
    store: {
      id: store.id,
      name: store.name,
      status: store.status,
    },
    workflowRun,
    workflowEvents,
  });
}
