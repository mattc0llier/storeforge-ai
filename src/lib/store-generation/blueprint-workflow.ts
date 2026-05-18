import type { Store } from "@/lib/db/schema";
import {
  generateStoreBlueprint,
  generateStoreConceptBlueprint,
  regenerateProductConcept,
} from "@/lib/store-generation/blueprint-generator";
import { updateStoreBlueprint } from "@/lib/stores/repository";

export const blueprintGenerationPhases = ["concept", "catalog", "full"] as const;

export type BlueprintGenerationPhase = (typeof blueprintGenerationPhases)[number];

export type BlueprintGenerationResult = {
  phase: BlueprintGenerationPhase;
  skipped: boolean;
  status: Store["status"];
  storeId: string;
};

export function parseBlueprintGenerationPhase(
  value: string | null,
): BlueprintGenerationPhase {
  if (value === "concept" || value === "catalog") {
    return value;
  }

  return "full";
}

export function hasGeneratedBrandConcept(store: Store) {
  return store.blueprint.storeName !== "Generating Store";
}

export async function runBlueprintGenerationPhase({
  phase,
  store,
}: {
  phase: BlueprintGenerationPhase;
  store: Store;
}): Promise<BlueprintGenerationResult> {
  if (store.status !== "generating") {
    return {
      phase,
      skipped: true,
      status: store.status,
      storeId: store.id,
    };
  }

  if (phase === "concept" && hasGeneratedBrandConcept(store)) {
    return {
      phase,
      skipped: true,
      status: store.status,
      storeId: store.id,
    };
  }

  const blueprint =
    phase === "concept"
      ? await generateStoreConceptBlueprint({
          prompt: store.originalPrompt,
        })
      : phase === "catalog"
        ? await regenerateProductConcept({
            originalPrompt: store.originalPrompt,
            currentBlueprint: store.blueprint,
          })
        : await generateStoreBlueprint({
            prompt: store.originalPrompt,
          });

  const updatedStore = await updateStoreBlueprint({
    storeId: store.id,
    blueprint,
    status: phase === "concept" ? "generating" : "draft",
  });

  return {
    phase,
    skipped: false,
    status: updatedStore.status,
    storeId: store.id,
  };
}
