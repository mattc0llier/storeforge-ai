"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function BlueprintGenerationTrigger({
  hasConcept,
  storeId,
}: {
  hasConcept: boolean;
  storeId: string;
}) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    async function generateBlueprint() {
      try {
        await runBlueprintPhase(storeId, hasConcept ? "catalog" : "concept");
        router.refresh();
      } catch (generationError) {
        setError(
          generationError instanceof Error
            ? generationError.message
            : "Blueprint generation failed.",
        );
        router.refresh();
      }
    }

    void generateBlueprint();
  }, [hasConcept, router, storeId]);

  if (!error) {
    return null;
  }

  return (
    <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error}
    </p>
  );
}

async function runBlueprintPhase(storeId: string, phase: "concept" | "catalog") {
  const response = await fetch(`/api/stores/${storeId}/blueprint?phase=${phase}`, {
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Blueprint generation failed.");
  }
}
