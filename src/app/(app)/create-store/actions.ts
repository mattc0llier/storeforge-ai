"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createPendingStoreJob } from "@/lib/stores/repository";

const CreateStoreFormSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, "Describe the store idea in at least 10 characters.")
    .max(1200, "Keep the spike prompt under 1,200 characters."),
});

const PendingPromptCookieName = "storeforge_pending_prompt";

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
    const cookieStore = await cookies();
    cookieStore.set(PendingPromptCookieName, parsed.data.prompt, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    redirect("/sign-in?redirect_url=/create-store");
  }

  try {
    const store = await createPendingStoreJob({
      userId,
      originalPrompt: parsed.data.prompt,
    });

    const cookieStore = await cookies();
    cookieStore.delete(PendingPromptCookieName);

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

export async function getPendingCreateStorePrompt() {
  const cookieStore = await cookies();

  return cookieStore.get(PendingPromptCookieName)?.value ?? "";
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
