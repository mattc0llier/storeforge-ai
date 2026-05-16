import Link from "next/link";
import { ArrowRight, GitBranch, Rocket, Store, Workflow } from "lucide-react";
import { auth } from "@clerk/nextjs/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStoreDashboardData } from "@/lib/stores/repository";

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const dashboard = userId
    ? await getStoreDashboardData({ userId, limit: 20 })
    : {
        stores: [],
        storeCount: 0,
        workflowRunCount: 0,
        deploymentCount: 0,
      };
  const latestStore = dashboard.stores[0];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal">
            StoreForge AI
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Build status, generated repositories, and deployments across your
            generated storefronts.
          </p>
        </div>
        <Button asChild>
          <Link href="/create-store">
            Create store
            <ArrowRight />
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="size-4" />
              Stores
            </CardTitle>
            <CardDescription>Generated storefronts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{dashboard.storeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="size-4" />
              Runs
            </CardTitle>
            <CardDescription>Workflow executions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {dashboard.workflowRunCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4" />
              Deployments
            </CardTitle>
            <CardDescription>Vercel deployment records</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {dashboard.deploymentCount}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stores</CardTitle>
          <CardDescription>
            Latest {Math.min(dashboard.stores.length, 20)} storefront
            {dashboard.stores.length === 1 ? "" : "s"} saved in Supabase.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={
                  latestStore
                    ? `/stores/${latestStore.id}/status`
                    : "/create-store"
                }
              >
                {latestStore ? "View latest status" : "Create store"}
                <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {dashboard.stores.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Repository</TableHead>
                  <TableHead>Deployment</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell className="font-medium">
                      <Link
                        className="hover:underline"
                        href={`/stores/${store.id}`}
                      >
                        {store.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{store.status}</Badge>
                    </TableCell>
                    <TableCell>{store.productCount}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="size-3" />
                        {store.generatedRepoFullName ?? "pending"}
                      </span>
                    </TableCell>
                    <TableCell>{formatDeploymentLabel(store.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/stores/${store.id}/status`}>
                          View
                          <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-md border border-dashed text-center">
              <div className="space-y-2">
                <p className="text-sm font-medium">No stores yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Create your first storefront blueprint and it will appear here
                  automatically.
                </p>
              </div>
              <Button asChild>
                <Link href="/create-store">
                  Create store
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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

function formatDeploymentLabel(status: string) {
  if (status === "deployed") {
    return "ready";
  }

  if (status === "deploying") {
    return "deploying";
  }

  return "pending";
}
