import type {
  StoreGenerationRunInput,
  StoreGenerationRunResult,
} from "./generation-types";
import { startSandboxStoreGeneration } from "./sandbox-generation";

export type {
  StoreGenerationRunInput,
  StoreGenerationRunResult,
} from "./generation-types";

export async function runStoreGeneration(
  input: StoreGenerationRunInput,
): Promise<StoreGenerationRunResult> {
  return startSandboxStoreGeneration(input);
}
