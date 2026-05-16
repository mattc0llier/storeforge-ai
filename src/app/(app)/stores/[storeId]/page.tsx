import {
  ImagePlus,
  Palette,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getLatestWorkflowRunForStore } from "@/lib/stores/workflow-runs";
import { getStoreJob } from "@/lib/stores/repository";

import {
  generateProductImagesAction,
  launchStoreAction,
  regenerateProductConceptAction,
} from "./actions";
import { BlueprintGenerationTrigger } from "./blueprint-generation-trigger";

export default async function StoreBlueprintPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const [store, latestRun] = await Promise.all([
    getStoreJob(storeId),
    getLatestWorkflowRunForStore(storeId),
  ]);

  if (!store) {
    notFound();
  }

  const blueprint = store.blueprint;

  if (store.status === "generating") {
    return <GeneratingBlueprintPage storeId={store.id} />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section>
        <div className="space-y-5 rounded-lg border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Store ID: {store.id.slice(0, 8)}</Badge>
          </div>

          <div className="max-w-3xl space-y-4">
            <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
              {blueprint.storeName}
            </h1>
            <p className="text-xl text-muted-foreground">
              {blueprint.tagline}
            </p>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <Metric label="Audience" value={blueprint.targetAudience} />
            <Metric
              label="Products"
              value={`${blueprint.products.length} launch SKU${
                blueprint.products.length === 1 ? "" : "s"
              }`}
            />
            <Metric label="Hero Product" value={blueprint.heroProduct} />
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {latestRun?.status === "running" || latestRun?.status === "queued" ? (
              <Button asChild size="lg">
                <a href={`/stores/${store.id}/status`}>
                  <Rocket />
                  View Launch
                </a>
              </Button>
            ) : (
              <form action={launchStoreAction.bind(null, store.id)}>
                <Button size="lg" type="submit">
                  <Rocket />
                  Launch Store
                </Button>
              </form>
            )}
            {latestRun?.status === "running" || latestRun?.status === "queued" ? (
              <Button disabled size="lg" variant="outline">
                <RefreshCw />
                Regenerate product concept
              </Button>
            ) : (
              <form action={regenerateProductConceptAction.bind(null, store.id)}>
                <Button size="lg" type="submit" variant="outline">
                  <RefreshCw />
                  Regenerate product concept
                </Button>
              </form>
            )}
            <Button disabled size="lg" variant="outline">
              <Sparkles />
              Regenerate brand
            </Button>
            {latestRun?.status === "running" || latestRun?.status === "queued" ? (
              <Button disabled size="lg" variant="outline">
                <ImagePlus />
                Generate images
              </Button>
            ) : (
              <form action={generateProductImagesAction.bind(null, store.id)}>
                <Button size="lg" type="submit" variant="outline">
                  <ImagePlus />
                  Generate images
                </Button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Launch approval will connect to the repository transformation flow
            in the next implementation step.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-5" />
              Direction
            </CardTitle>
            <CardDescription>{blueprint.visualDirection}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {blueprint.colorPalette.map((color) => (
                <div
                  className="flex items-center gap-3 rounded-md border p-3"
                  key={`${color.name}-${color.hex}`}
                >
                  <div
                    aria-label={`${color.name} swatch`}
                    className="size-10 shrink-0 rounded-md border"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{color.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {color.hex}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Catalog strategy</p>
              <p className="text-sm text-muted-foreground">
                {blueprint.catalogStrategy}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Hero image prompt</p>
              <p className="text-sm text-muted-foreground">
                {blueprint.heroImagePrompt}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch Catalog</CardTitle>
            <CardDescription>
              Small enough to transform safely, specific enough to make the demo
              feel real.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blueprint.products.map((product) => (
              <div
                className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-start"
                key={product.id}
              >
                <div
                  aria-label={product.imageAlt}
                  className="aspect-square size-16 shrink-0 rounded-md border bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url(${product.imageUrl})` }}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{product.title}</p>
                    {product.id === blueprint.heroProductId ? (
                      <Badge variant="secondary">Hero</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {product.description}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    Image prompt: {product.imagePrompt}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  ${product.price} {product.currencyCode}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function GeneratingBlueprintPage({ storeId }: { storeId: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <BlueprintGenerationTrigger storeId={storeId} />

      <section className="space-y-6 rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <div className="h-8 w-44 animate-pulse rounded-full bg-muted" />

        <div className="max-w-3xl space-y-4">
          <div className="h-14 w-2/3 animate-pulse rounded-xl bg-muted" />
          <div className="h-8 w-1/2 animate-pulse rounded-xl bg-muted" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
        </div>

        <Separator />

        <div className="flex flex-wrap gap-3">
          <div className="h-11 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-11 w-64 animate-pulse rounded-full bg-muted" />
          <div className="h-11 w-44 animate-pulse rounded-full bg-muted" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
            <div className="h-5 w-2/3 animate-pulse rounded-lg bg-muted" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  className="flex items-center gap-3 rounded-md border p-3"
                  key={index}
                >
                  <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="h-5 w-36 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
            <div className="h-5 w-2/3 animate-pulse rounded-lg bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row"
                key={index}
              >
                <div className="aspect-square size-16 shrink-0 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SkeletonMetric() {
  return (
    <div className="rounded-md border bg-background/60 p-4">
      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-5 w-4/5 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-5 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 leading-6">{value}</p>
    </div>
  );
}
