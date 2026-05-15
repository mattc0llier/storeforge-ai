import { z } from "zod";

export * from "./store-blueprint";

export const StoreGenerationRequestSchema = z.object({
  clerkUserId: z.string().min(1),
  storeName: z.string().min(1),
  businessIdea: z.string().min(10),
  productCount: z.coerce.number().int().min(1).max(7),
  brandTone: z.string().optional(),
});

export type StoreGenerationRequest = z.infer<
  typeof StoreGenerationRequestSchema
>;

export interface StoreGenerationPlan {
  storeId: string;
  prompt: string;
  productCount: number;
  templateRepository: string;
}

export function createStoreGenerationPlan(
  request: StoreGenerationRequest,
): StoreGenerationPlan {
  const parsed = StoreGenerationRequestSchema.parse(request);

  return {
    storeId: "pending",
    prompt: [
      `Store name: ${parsed.storeName}`,
      `Business idea: ${parsed.businessIdea}`,
      `Product count: ${parsed.productCount}`,
      parsed.brandTone ? `Brand tone: ${parsed.brandTone}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    productCount: parsed.productCount,
    templateRepository: "vercel/commerce",
  };
}
