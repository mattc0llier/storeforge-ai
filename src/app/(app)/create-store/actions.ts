"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createStoreJob } from "@/lib/stores/repository";
import { generateStoreBlueprintFromPrompt } from "@/lib/store-generation/store-blueprint";

const CreateStoreFormSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, "Describe the store idea in at least 10 characters.")
    .max(1200, "Keep the spike prompt under 1,200 characters."),
});

export type CreateStoreActionState = {
  error?: string;
};

export async function createStoreAction(
  _previousState: CreateStoreActionState,
  formData: FormData,
): Promise<CreateStoreActionState> {
  const parsed = CreateStoreFormSchema.safeParse({
    prompt: formData.get("prompt"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Enter a store idea.",
    };
  }

  const userId = await getCurrentUserId();

  if (!userId) {
    return {
      error: "Sign in before creating a StoreForge workspace.",
    };
  }

  try {
    const blueprint = generateStoreBlueprintFromPrompt(parsed.data.prompt);
    const store = await createStoreJob({
      userId,
      originalPrompt: parsed.data.prompt,
      blueprint,
    });

    redirect(`/stores/${store.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return {
      error:
        error instanceof Error
          ? error.message
          : "Store blueprint generation failed.",
    };
  }
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

function isRedirectError(error: unknown) {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
