import { describe, expect, it } from "vitest";

import {
  createMockStoreBlueprint,
  createPendingStoreBlueprint,
  generateStoreBlueprintFromPrompt,
  StoreBlueprintSchema,
} from "@/lib/store-generation/store-blueprint";

describe("StoreBlueprintSchema", () => {
  it("accepts generated blueprints with bounded products and palette colors", () => {
    const blueprint = generateStoreBlueprintFromPrompt(
      "A design-led dog accessories store with four products.",
    );

    const parsed = StoreBlueprintSchema.parse(blueprint);

    expect(parsed.products).toHaveLength(4);
    expect(parsed.products.length).toBeGreaterThanOrEqual(1);
    expect(parsed.products.length).toBeLessThanOrEqual(7);
    expect(parsed.colorPalette.length).toBeGreaterThanOrEqual(3);
    expect(parsed.colorPalette.length).toBeLessThanOrEqual(6);
    expect(parsed.products.map((product) => product.id)).toContain(
      parsed.heroProductId,
    );
    expect(parsed.heroProduct).toBe(
      parsed.products.find((product) => product.id === parsed.heroProductId)
        ?.title,
    );
  });

  it("keeps deterministic product generation inside the 1-7 product contract", () => {
    const blueprint = generateStoreBlueprintFromPrompt(
      "A weekend hiking gear store with nine products.",
    );

    const parsed = StoreBlueprintSchema.parse(blueprint);

    expect(parsed.products.length).toBeGreaterThanOrEqual(1);
    expect(parsed.products.length).toBeLessThanOrEqual(7);
  });

  it("rejects product catalogs outside the 1-7 product contract", () => {
    const blueprint = createMockStoreBlueprint();
    const tooManyProducts = Array.from({ length: 8 }, (_, index) => ({
      ...blueprint.products[0],
      id: `product-${index}`,
      handle: `product-${index}`,
      title: `Product ${index}`,
    }));

    expect(
      StoreBlueprintSchema.safeParse({
        ...blueprint,
        products: tooManyProducts,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid color palette hex values", () => {
    const blueprint = createMockStoreBlueprint();

    expect(
      StoreBlueprintSchema.safeParse({
        ...blueprint,
        colorPalette: [
          {
            ...blueprint.colorPalette[0],
            hex: "not-a-hex",
          },
          ...blueprint.colorPalette.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps pending blueprints valid while catalog generation runs later", () => {
    const pending = createPendingStoreBlueprint(
      "A premium matcha store for designers.",
    );

    const parsed = StoreBlueprintSchema.parse(pending);

    expect(parsed.storeName).toBe("Generating Store");
    expect(parsed.products).toHaveLength(1);
    expect(parsed.heroProductId).toBe(parsed.products[0].id);
  });
});
