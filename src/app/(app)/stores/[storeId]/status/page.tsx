import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { getStoreJob } from "@/lib/stores/repository";
import { getLatestWorkflowRunForStore } from "@/lib/stores/workflow-runs";

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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Store ID: {store.id.slice(0, 8)}</Badge>
          <Badge variant="secondary">{store.status}</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-normal">
          {store.name} Launch Status
        </h1>
        <p className="text-sm text-muted-foreground">
          Live generation progress, concise logs, and repository artifact metadata
          for the autonomous Commerce transformation.
        </p>
      </div>

      <WorkflowStatusPanel
        initialWorkflowRun={workflowRun}
        storeId={store.id}
      />
    </div>
  );
}
