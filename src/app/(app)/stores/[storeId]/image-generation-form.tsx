"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoreBlueprint } from "@/lib/store-generation/store-blueprint";
import { cn } from "@/lib/utils";

type Product = StoreBlueprint["products"][number];
type FormAction = Exclude<ComponentProps<"form">["action"], string | undefined>;

export function ImageGenerationForm({
  action,
  disabled,
  generatedImageCount,
  hasGeneratedProductImages,
  heroProductId,
  products,
}: {
  action: FormAction;
  disabled: boolean;
  generatedImageCount: number;
  hasGeneratedProductImages: boolean;
  heroProductId: string;
  products: Product[];
}) {
  return (
    <form action={action} className="contents">
      <ImageGenerationHeader
        disabled={disabled}
        hasGeneratedProductImages={hasGeneratedProductImages}
      />
      <ImageGenerationContent
        generatedImageCount={generatedImageCount}
        hasGeneratedProductImages={hasGeneratedProductImages}
        heroProductId={heroProductId}
        products={products}
      />
    </form>
  );
}

function ImageGenerationHeader({
  disabled,
  hasGeneratedProductImages,
}: {
  disabled: boolean;
  hasGeneratedProductImages: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Launch Catalog</h2>
        <p className="text-sm text-muted-foreground">
          Small enough to transform safely, specific enough to make the demo
          feel real.
        </p>
      </div>
      <Button
        disabled={disabled || pending}
        size="sm"
        type="submit"
        variant={hasGeneratedProductImages ? "secondary" : "default"}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        {pending
          ? "Generating product images..."
          : hasGeneratedProductImages
            ? "Regenerate images"
            : "Generate images for product concepts"}
      </Button>
    </div>
  );
}

function ImageGenerationContent({
  generatedImageCount,
  hasGeneratedProductImages,
  heroProductId,
  products,
}: {
  generatedImageCount: number;
  hasGeneratedProductImages: boolean;
  heroProductId: string;
  products: Product[];
}) {
  const { pending } = useFormStatus();

  return (
    <div aria-busy={pending} className="space-y-4 px-6 pb-6">
      {pending ? (
        <p className="text-xs text-muted-foreground">
          Generating catalog images now. The approved product concepts stay
          visible while image assets are created and uploaded.
        </p>
      ) : !hasGeneratedProductImages ? (
        <p className="text-xs text-muted-foreground">
          Use the button above to generate product images from these concepts
          before creating the final Commerce repository.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {generatedImageCount} product image
          {generatedImageCount === 1 ? "" : "s"} ready for the generated
          storefront.
        </p>
      )}

      {products.map((product) => (
        <ProductConceptRow
          isHero={product.id === heroProductId}
          isPending={pending}
          key={product.id}
          product={product}
          showGeneratedImage={hasGeneratedProductImages && !pending}
        />
      ))}
    </div>
  );
}

function ProductConceptRow({
  isHero,
  isPending,
  product,
  showGeneratedImage,
}: {
  isHero: boolean;
  isPending: boolean;
  product: Product;
  showGeneratedImage: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border p-4 transition-colors sm:flex-row sm:items-start",
        isPending && "bg-muted/30",
      )}
    >
      {showGeneratedImage ? (
        <div
          aria-label={product.imageAlt}
          className="aspect-square size-16 shrink-0 rounded-md border bg-cover bg-center"
          role="img"
          style={{ backgroundImage: `url(${product.imageUrl})` }}
        />
      ) : (
        <div
          aria-label={
            isPending
              ? `Generating image for ${product.title}`
              : "Product image placeholder"
          }
          className="relative flex aspect-square size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
          role="img"
        >
          {isPending ? (
            <>
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-background to-muted" />
              <Loader2 className="relative size-5 animate-spin text-muted-foreground" />
            </>
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{product.title}</p>
          {isHero ? <Badge variant="secondary">Hero</Badge> : null}
        </div>
        {isPending ? (
          <p className="text-sm text-muted-foreground">
            Generating {product.title} image...
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {product.description}
          </p>
        )}
        <p className="line-clamp-2 text-xs text-muted-foreground">
          Image prompt: {product.imagePrompt}
        </p>
      </div>
      <p className="text-sm font-semibold">
        ${product.price} {product.currencyCode}
      </p>
    </div>
  );
}
