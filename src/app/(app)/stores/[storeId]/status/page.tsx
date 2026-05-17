import { notFound } from "next/navigation";

import { getStoreJob } from "@/lib/stores/repository";
import {
  getLatestWorkflowRunForStore,
  getWorkflowEventsForRun,
} from "@/lib/stores/workflow-runs";

import { WorkflowStatusPanel } from "./workflow-status-panel";

export default async function StoreStatusPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const [store, workflowRun] = await Promise.all([
    getStoreJob(storeId),
    getLatestWorkflowRunForStore(storeId),
  ]);

  if (!store) {
    notFound();
  }

  const workflowEvents = workflowRun
    ? await getWorkflowEventsForRun(workflowRun.id).catch(() => [])
    : [];

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <WorkflowStatusPanel
        initialWorkflowEvents={workflowEvents}
        initialWorkflowRun={workflowRun}
        initialStoreName={store.name}
        initialStoreStatus={store.status}
        storeId={store.id}
      />
    </div>
  );
}
