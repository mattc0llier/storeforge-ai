import {
  ExternalLink,
  Palette,
  RefreshCw,
  Rocket,
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
import {
  getLatestDeploymentMetadataForStore,
  getStoreJob,
} from "@/lib/stores/repository";
import type { StoreBlueprint } from "@/lib/store-generation/store-blueprint";

import {
  generateProductImagesAction,
  regenerateProductConceptAction,
} from "./actions";
import { BlueprintGenerationTrigger } from "./blueprint-generation-trigger";
import { ImageGenerationForm } from "./image-generation-form";
import { GenerateStoreForm } from "./generate-store-form";

export default async function StoreBlueprintPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const [store, latestRun, latestDeployment] = await Promise.all([
    getStoreJob(storeId),
    getLatestWorkflowRunForStore(storeId),
    getLatestDeploymentMetadataForStore(storeId),
  ]);

  if (!store) {
    notFound();
  }

  const blueprint = store.blueprint;
  const isWorkflowActive =
    latestRun?.status === "running" || latestRun?.status === "queued";
  const generatedProductImageCount = blueprint.products.filter((product) =>
    product.imageUrl.includes("blob.vercel-storage.com"),
  ).length;
  const hasGeneratedProductImages =
    generatedProductImageCount === blueprint.products.length;

  if (store.status === "generating") {
    return (
      <GeneratingBlueprintPage blueprint={blueprint} storeId={store.id} />
    );
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
            {isWorkflowActive ? (
              <Button asChild size="lg">
                <a href={`/stores/${store.id}/status`}>
                  <Rocket />
                  View generation
                </a>
              </Button>
            ) : (
              <form action={regenerateProductConceptAction.bind(null, store.id)}>
                <Button size="lg" type="submit" variant="outline">
                  <RefreshCw />
                  Regenerate product concept
                </Button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Tune the concept here, then review catalog imagery before the final
            store generation step.
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
          <ImageGenerationForm
            action={generateProductImagesAction.bind(null, store.id)}
            disabled={isWorkflowActive}
            generatedImageCount={generatedProductImageCount}
            hasGeneratedProductImages={hasGeneratedProductImages}
            heroProductId={blueprint.heroProductId}
            products={blueprint.products}
          />
        </Card>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Ready to generate the store?</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Once the brand, products, palette, and product images feel right,
            generate the Commerce repository and deployment workflow.
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:mt-0 sm:min-w-56">
          {isWorkflowActive ? (
            <Button asChild size="lg">
              <a href={`/stores/${store.id}/status`}>
                <Rocket />
                View generation
              </a>
            </Button>
          ) : (
            <GenerateStoreForm
              disabled={!hasGeneratedProductImages}
              storeId={store.id}
            />
          )}
          {!hasGeneratedProductImages && !isWorkflowActive ? (
            <p className="text-xs text-muted-foreground">
              Generate product images first so the final Commerce store uses
              your approved catalog assets.
            </p>
          ) : null}
          {store.status === "deployed" && latestDeployment?.productionUrl ? (
            <Button asChild size="lg" variant="secondary">
              <a
                href={latestDeployment.productionUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink />
                View live store
              </a>
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function GeneratingBlueprintPage({
  blueprint,
  storeId,
}: {
  blueprint: StoreBlueprint;
  storeId: string;
}) {
  const hasConcept = blueprint.storeName !== "Generating Store";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <BlueprintGenerationTrigger hasConcept={hasConcept} storeId={storeId} />

      <section className="space-y-6 rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <Badge variant="outline">Store ID: {storeId.slice(0, 8)}</Badge>

        <div className="max-w-3xl space-y-4">
          {hasConcept ? (
            <>
              <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
                {blueprint.storeName}
              </h1>
              <p className="text-xl text-muted-foreground">
                {blueprint.tagline}
              </p>
            </>
          ) : (
            <>
              <div className="h-14 w-2/3 animate-pulse rounded-xl bg-muted" />
              <div className="h-8 w-1/2 animate-pulse rounded-xl bg-muted" />
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {hasConcept ? (
            <>
              <Metric label="Audience" value={blueprint.targetAudience} />
              <SkeletonMetric label="Products" />
              <SkeletonMetric label="Hero product" />
            </>
          ) : (
            <>
              <SkeletonMetric label="Audience" />
              <SkeletonMetric label="Products" />
              <SkeletonMetric label="Hero product" />
            </>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">
            {hasConcept
              ? "Brand concept ready. Generating product catalog next."
              : "Generating brand concept."}
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
            {hasConcept ? (
              <CardDescription>{blueprint.visualDirection}</CardDescription>
            ) : (
              <div className="h-5 w-2/3 animate-pulse rounded-lg bg-muted" />
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {hasConcept
                ? blueprint.colorPalette.map((color) => (
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
                  ))
                : Array.from({ length: 4 }).map((_, index) => (
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
            {hasConcept ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Brand voice</p>
                <p className="text-sm text-muted-foreground">
                  {blueprint.brandVoice}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="h-5 w-36 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch Catalog</CardTitle>
            <CardDescription>
              Products are being generated after the brand concept.
            </CardDescription>
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

function SkeletonMetric({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
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
