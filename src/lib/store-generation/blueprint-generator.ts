import {
  StoreBlueprintSchema,
  generateStoreBlueprintFromPrompt,
  type Product,
  type StoreBlueprint,
} from "@/lib/store-generation/store-blueprint";

const CatalogRegenerationSchema = StoreBlueprintSchema.pick({
  catalogStrategy: true,
  products: true,
  heroProductId: true,
  heroProduct: true,
  heroImagePrompt: true,
});

type OpenAIResponsesBody = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export async function generateStoreBlueprint({
  prompt,
}: {
  prompt: string;
}): Promise<StoreBlueprint> {
  const fallback = applyImagePromptConcept(generateStoreBlueprintFromPrompt(prompt));

  if (!getOpenAIConfig()) {
    return fallback;
  }

  try {
    const generated = await requestStructuredOutput({
      schemaName: "store_blueprint",
      schema: STORE_BLUEPRINT_JSON_SCHEMA,
      system:
        "You create concise ecommerce store blueprints for StoreForge AI. Return only valid structured data. Keep catalogs focused, specific, and production-safe.",
      user: [
        "Create a StoreBlueprint for this business idea.",
        "The generated storefront will transform a Vercel Commerce template, so keep the catalog small and concrete.",
        "Use 1 to 7 products. Choose one hero product. Use prompt-first image fields and placeholder image URLs.",
        `Every product imagePrompt and heroImagePrompt must follow this concept: ${IMAGE_PROMPT_CONCEPT}`,
        `Allowed placeholder image URLs: ${PLACEHOLDER_IMAGE_URLS.join(", ")}`,
        `Business idea: ${prompt}`,
      ].join("\n"),
    });

    return applyImagePromptConcept(
      ensureHeroProductConsistency(StoreBlueprintSchema.parse(generated)),
    );
  } catch (error) {
    console.warn("[blueprint-generator] falling back to deterministic blueprint", error);
    return fallback;
  }
}

export async function regenerateProductConcept({
  originalPrompt,
  currentBlueprint,
}: {
  originalPrompt: string;
  currentBlueprint: StoreBlueprint;
}): Promise<StoreBlueprint> {
  const fallback = createFallbackCatalogVariation(currentBlueprint);

  if (!getOpenAIConfig()) {
    return fallback;
  }

  try {
    const catalog = CatalogRegenerationSchema.parse(await requestStructuredOutput({
      schemaName: "store_catalog_regeneration",
      schema: CATALOG_REGENERATION_JSON_SCHEMA,
      system:
        "You regenerate only the product catalog section of an existing ecommerce blueprint. Preserve brand, audience, theme, palette, voice, and homepage positioning.",
      user: [
        "Regenerate the product concept for this StoreBlueprint.",
        "Keep the brand/theme stable. Change only catalogStrategy, products, heroProductId, heroProduct, and heroImagePrompt.",
        "Use 1 to 7 products. Make the new catalog meaningfully different from the current one while staying aligned with the original prompt.",
        "Product images are prompt-first for now: improve imagePrompt and imageAlt, and use valid placeholder imageUrl values.",
        `Every product imagePrompt and heroImagePrompt must follow this concept: ${IMAGE_PROMPT_CONCEPT}`,
        `Allowed placeholder image URLs: ${PLACEHOLDER_IMAGE_URLS.join(", ")}`,
        `Original prompt: ${originalPrompt}`,
        `Current blueprint JSON: ${JSON.stringify(currentBlueprint)}`,
      ].join("\n"),
    }));

    const next = StoreBlueprintSchema.parse({
      ...currentBlueprint,
      ...catalog,
    });

    return applyImagePromptConcept(ensureHeroProductConsistency(next));
  } catch (error) {
    console.warn("[blueprint-generator] falling back to deterministic catalog regeneration", error);
    return fallback;
  }
}

async function requestStructuredOutput({
  schemaName,
  schema,
  system,
  user,
}: {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
}) {
  const config = getOpenAIConfig();

  if (!config) {
    throw new Error("OpenAI API key is not configured.");
  }

  const response = await fetch(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: user,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const body = (await response.json()) as OpenAIResponsesBody;

  if (!response.ok) {
    throw new Error(
      body.error?.message ?? `OpenAI structured generation failed with ${response.status}`,
    );
  }

  const text = extractOutputText(body);

  if (!text) {
    throw new Error("OpenAI structured generation returned no output text.");
  }

  return JSON.parse(text) as unknown;
}

function extractOutputText(body: OpenAIResponsesBody) {
  if (body.output_text) {
    return body.output_text;
  }

  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal ?? "OpenAI refused blueprint generation.");
      }

      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return null;
}

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.CODEX_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl:
      process.env.OPENAI_BASE_URL ??
      process.env.CODEX_BASE_URL ??
      "https://api.openai.com/v1",
    model:
      process.env.STOREFORGE_BLUEPRINT_MODEL ??
      process.env.OPENAI_BLUEPRINT_MODEL ??
      "gpt-4o-mini",
  };
}

function createFallbackCatalogVariation(
  currentBlueprint: StoreBlueprint,
): StoreBlueprint {
  const productCount = currentBlueprint.products.length;
  const products = Array.from({ length: productCount }, (_, index) =>
    createFallbackProduct(currentBlueprint, index),
  );
  const heroProduct = products[0];

  return applyImagePromptConcept(StoreBlueprintSchema.parse({
    ...currentBlueprint,
    catalogStrategy: `Refresh the launch catalog around ${productCount} refined concept${
      productCount === 1 ? "" : "s"
    } that keep ${currentBlueprint.storeName} focused while making the product story feel new.`,
    products,
    heroProductId: heroProduct.id,
    heroProduct: heroProduct.title,
    heroImagePrompt: `${heroProduct.imagePrompt} Cinematic ecommerce hero image, premium lighting, uncluttered background, no text.`,
  }));
}

function createFallbackProduct(
  currentBlueprint: StoreBlueprint,
  index: number,
): Product {
  const template = FALLBACK_PRODUCT_CONCEPTS[index % FALLBACK_PRODUCT_CONCEPTS.length];
  const handle = `${template.handle}-${index + 1}`;
  const id = `${slugify(currentBlueprint.storeName)}-${handle}`;

  return {
    id,
    handle,
    title: template.title,
    description: template.description.replace(
      "{brand}",
      currentBlueprint.storeName,
    ),
    price: template.price,
    currencyCode: "USD",
    imageUrl: PLACEHOLDER_IMAGE_URLS[index % PLACEHOLDER_IMAGE_URLS.length],
    imageAlt: `${template.title} styled for ${currentBlueprint.storeName}.`,
    imagePrompt: createNaturalEnvironmentImagePrompt({
      productTitle: template.title,
      basePrompt: `${template.title} for ${currentBlueprint.storeName}. ${template.imagePrompt} ${currentBlueprint.visualDirection}`,
    }),
  };
}

function ensureHeroProductConsistency(blueprint: StoreBlueprint): StoreBlueprint {
  if (blueprint.products.some((product) => product.id === blueprint.heroProductId)) {
    return blueprint;
  }

  const heroProduct = blueprint.products[0];

  return StoreBlueprintSchema.parse({
    ...blueprint,
    heroProductId: heroProduct.id,
    heroProduct: heroProduct.title,
    heroImagePrompt: `${heroProduct.imagePrompt} Cinematic ecommerce hero image, premium lighting, uncluttered background, no text.`,
  });
}

function applyImagePromptConcept(blueprint: StoreBlueprint): StoreBlueprint {
  const products = blueprint.products.map((product) => ({
    ...product,
    imagePrompt: createNaturalEnvironmentImagePrompt({
      productTitle: product.title,
      basePrompt: product.imagePrompt,
    }),
  }));
  const heroProduct =
    products.find((product) => product.id === blueprint.heroProductId) ?? products[0];

  return StoreBlueprintSchema.parse({
    ...blueprint,
    products,
    heroProductId: heroProduct.id,
    heroProduct: heroProduct.title,
    heroImagePrompt: createNaturalEnvironmentImagePrompt({
      productTitle: heroProduct.title,
      basePrompt: blueprint.heroImagePrompt,
    }),
  });
}

function createNaturalEnvironmentImagePrompt({
  productTitle,
  basePrompt,
}: {
  productTitle: string;
  basePrompt: string;
}) {
  const normalizedConcept = IMAGE_PROMPT_CONCEPT.replace("[product]", productTitle);

  if (basePrompt.includes("Place the") && basePrompt.includes("natural real-life environment")) {
    return basePrompt;
  }

  return `${basePrompt} ${normalizedConcept}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const PLACEHOLDER_IMAGE_URLS = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=1200&q=80",
] as const;

const IMAGE_PROMPT_CONCEPT =
  "Place the [product] in its natural real-life environment, styled realistically, keep the exact product design, branding, and proportions, use believable lighting and shadows, make the scene look like authentic commercial photography.";

const FALLBACK_PRODUCT_CONCEPTS = [
  {
    handle: "hero-edit",
    title: "Hero Edit",
    description:
      "A flagship {brand} product that explains the store promise in one confident purchase.",
    price: "72.00",
    imagePrompt:
      "Flagship product arrangement on a clean studio surface, sharp premium ecommerce lighting.",
  },
  {
    handle: "daily-set",
    title: "Daily Set",
    description:
      "A practical {brand} bundle built for repeat use and easy merchandising.",
    price: "48.00",
    imagePrompt:
      "Compact daily-use product set with crisp shadows, modern catalog photography.",
  },
  {
    handle: "gift-kit",
    title: "Gift Kit",
    description:
      "A polished {brand} kit designed to add a natural gifting moment to the launch catalog.",
    price: "96.00",
    imagePrompt:
      "Curated gift-ready kit with premium packaging, tactile details, no text.",
  },
  {
    handle: "travel-version",
    title: "Travel Version",
    description:
      "A portable {brand} format that extends the catalog into on-the-go routines.",
    price: "38.00",
    imagePrompt:
      "Portable product version in a minimal lifestyle travel scene, natural light.",
  },
  {
    handle: "refill-pack",
    title: "Refill Pack",
    description:
      "A replenishment-focused {brand} product that gives the storefront a repeat-purchase angle.",
    price: "28.00",
    imagePrompt:
      "Refill product pack with orderly packaging, clean background, high-end ecommerce.",
  },
  {
    handle: "collector-set",
    title: "Collector Set",
    description:
      "A premium {brand} set that gives the small catalog a higher-value anchor.",
    price: "128.00",
    imagePrompt:
      "Premium collector set arranged with restrained props, editorial product photography.",
  },
  {
    handle: "starter-pack",
    title: "Starter Pack",
    description:
      "A clear entry-point {brand} product for shoppers who want the simplest first purchase.",
    price: "42.00",
    imagePrompt:
      "Starter pack product arrangement on pale background, approachable premium styling.",
  },
] as const;

const COLOR_PALETTE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    hex: {
      type: "string",
      description: "A six-digit hex color such as #111827.",
    },
    usage: { type: "string" },
  },
  required: ["name", "hex", "usage"],
} as const;

const THEME_DIRECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    primaryColor: { type: "string" },
    accentColor: { type: "string" },
    backgroundColor: { type: "string" },
    textColor: { type: "string" },
    mood: { type: "string" },
  },
  required: [
    "name",
    "primaryColor",
    "accentColor",
    "backgroundColor",
    "textColor",
    "mood",
  ],
} as const;

const PRODUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    handle: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    price: {
      type: "string",
      description: "A decimal price string like 48.00.",
    },
    currencyCode: {
      type: "string",
      description: "Use USD for now.",
    },
    imageUrl: {
      type: "string",
      description:
        "A valid https placeholder image URL. Prefer one of the placeholder URLs supplied in the prompt when unsure.",
    },
    imageAlt: { type: "string" },
    imagePrompt: {
      type: "string",
      description:
        "A product image generation prompt with subject, setting, lighting, and ecommerce style. No text in image.",
    },
  },
  required: [
    "id",
    "handle",
    "title",
    "description",
    "price",
    "currencyCode",
    "imageUrl",
    "imageAlt",
    "imagePrompt",
  ],
} as const;

const STORE_BLUEPRINT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    storeName: { type: "string" },
    businessIdea: { type: "string" },
    tagline: { type: "string" },
    targetAudience: { type: "string" },
    visualDirection: { type: "string" },
    colorPalette: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: COLOR_PALETTE_ITEM_SCHEMA,
    },
    catalogStrategy: { type: "string" },
    homepageHeadline: { type: "string" },
    homepageSubheading: { type: "string" },
    brandVoice: { type: "string" },
    theme: THEME_DIRECTION_SCHEMA,
    products: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: PRODUCT_SCHEMA,
    },
    heroProductId: { type: "string" },
    heroProduct: { type: "string" },
    heroImagePrompt: { type: "string" },
  },
  required: [
    "storeName",
    "businessIdea",
    "tagline",
    "targetAudience",
    "visualDirection",
    "colorPalette",
    "catalogStrategy",
    "homepageHeadline",
    "homepageSubheading",
    "brandVoice",
    "theme",
    "products",
    "heroProductId",
    "heroProduct",
    "heroImagePrompt",
  ],
} as const;

const CATALOG_REGENERATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    catalogStrategy: { type: "string" },
    products: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: PRODUCT_SCHEMA,
    },
    heroProductId: { type: "string" },
    heroProduct: { type: "string" },
    heroImagePrompt: { type: "string" },
  },
  required: [
    "catalogStrategy",
    "products",
    "heroProductId",
    "heroProduct",
    "heroImagePrompt",
  ],
} as const;
