import { uploadStoreAsset } from "@/lib/blob";
import {
  StoreBlueprintSchema,
  type Product,
  type StoreBlueprint,
} from "@/lib/store-generation/store-blueprint";

type OpenAIImageGenerationResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  error?: {
    message?: string;
  };
};

type ImageGenerationResult = {
  bytes: Buffer;
  contentType: string;
  extension: string;
};

export async function generateAndUploadBlueprintImages({
  storeId,
  blueprint,
}: {
  storeId: string;
  blueprint: StoreBlueprint;
}): Promise<StoreBlueprint> {
  const products: Product[] = [];

  for (const product of blueprint.products) {
    const image = await generateProductImage(product.imagePrompt);
    const asset = await uploadStoreAsset({
      storeId,
      pathname: `products/${product.handle || product.id}.${image.extension}`,
      body: image.bytes,
      contentType: image.contentType,
    });

    products.push({
      ...product,
      imageUrl: asset.url,
    });
  }

  const heroProduct =
    products.find((product) => product.id === blueprint.heroProductId) ??
    products[0];

  return StoreBlueprintSchema.parse({
    ...blueprint,
    products,
    heroProductId: heroProduct.id,
    heroProduct: heroProduct.title,
  });
}

async function generateProductImage(
  prompt: string,
): Promise<ImageGenerationResult> {
  const config = getImageGenerationConfig();

  const response = await fetch(`${config.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: config.size,
      quality: config.quality,
      output_format: config.outputFormat,
    }),
  });

  const body = (await response.json()) as OpenAIImageGenerationResponse;

  if (!response.ok) {
    throw new Error(
      body.error?.message ??
        `OpenAI image generation failed with ${response.status}`,
    );
  }

  const image = body.data?.[0];

  if (image?.b64_json) {
    return {
      bytes: Buffer.from(image.b64_json, "base64"),
      contentType: `image/${config.outputFormat}`,
      extension: config.outputFormat,
    };
  }

  if (image?.url) {
    const generatedImage = await fetch(image.url);

    if (!generatedImage.ok) {
      throw new Error(
        `Failed to fetch generated image URL: ${generatedImage.status}`,
      );
    }

    const contentType =
      generatedImage.headers.get("content-type") ?? "image/png";

    return {
      bytes: Buffer.from(await generatedImage.arrayBuffer()),
      contentType,
      extension: extensionFromContentType(contentType),
    };
  }

  throw new Error("OpenAI image generation returned no image data.");
}

function getImageGenerationConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.CODEX_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate product images.");
  }

  return {
    apiKey,
    baseUrl:
      process.env.OPENAI_BASE_URL ??
      process.env.CODEX_BASE_URL ??
      "https://api.openai.com/v1",
    model: process.env.STOREFORGE_IMAGE_MODEL ?? "gpt-image-1",
    quality: process.env.STOREFORGE_IMAGE_QUALITY ?? "low",
    size: process.env.STOREFORGE_IMAGE_SIZE ?? "1024x1024",
    outputFormat: process.env.STOREFORGE_IMAGE_FORMAT ?? "webp",
  };
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}
