import Link from "next/link";
import { ArrowRight, GitBranch, Rocket, Store, Workflow } from "lucide-react";

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

const recentStores = [
  {
    id: "demo-store",
    name: "Demo Store",
    status: "draft",
    products: 3,
    repo: "pending",
    deployment: "pending",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Badge variant="secondary">Demo scaffold</Badge>
          <h1 className="text-3xl font-semibold tracking-normal">
            StoreForge AI
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Build status, generated repositories, and deployments will surface
            here as the workflow integrations come online.
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
            <p className="text-3xl font-semibold">1</p>
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
            <p className="text-3xl font-semibold">0</p>
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
            <p className="text-3xl font-semibold">0</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stores</CardTitle>
          <CardDescription>
            Placeholder data until Supabase persistence is connected.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href="/stores/demo-store/status">
                View status
                <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Deployment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentStores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{store.status}</Badge>
                  </TableCell>
                  <TableCell>{store.products}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="size-3" />
                      {store.repo}
                    </span>
                  </TableCell>
                  <TableCell>{store.deployment}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
