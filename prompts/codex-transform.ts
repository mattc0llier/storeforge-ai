import type { StoreBlueprint } from "../lib/store-generation/store-blueprint";

export interface BuildTransformPromptOptions {
  blueprint: StoreBlueprint;
}

export interface BuildRepairPromptOptions {
  attempt: number;
  maxAttempts: number;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  modifiedFiles: string[];
}

export function buildCommerceTransformPrompt({
  blueprint,
}: BuildTransformPromptOptions) {
  return [
    "You are transforming a cloned Vercel Commerce repository for a StoreForge AI reliability spike.",
    "",
    "Goal:",
    "- Apply a small, build-safe ecommerce storefront transformation.",
    "- Preserve the production-grade commerce architecture and keep the repository buildable.",
    "",
    "StoreBlueprint:",
    JSON.stringify(blueprint, null, 2),
    "",
    "Required source changes:",
    "- Update branding to the StoreBlueprint store name and tagline.",
    "- Update homepage metadata and homepage messaging.",
    "- Inject the generated products as a tiny local fallback catalog for unconfigured Shopify environments.",
    "- Apply a simple theme/color transformation using existing Tailwind/CSS patterns.",
    "",
    "Suggested safe areas to inspect first:",
    "- app/page.tsx",
    "- app/layout.tsx",
    "- app/globals.css",
    "- components/layout/navbar/index.tsx",
    "- components/layout/footer.tsx",
    "- components/grid/three-items.tsx",
    "- components/carousel.tsx",
    "- lib/shopify/index.ts",
    "- lib/shopify/types.ts",
    "",
    "Bounded autonomy constraints:",
    "- NEVER rewrite core commerce infrastructure.",
    "- Do not remove or weaken cart, checkout, Shopify fetch, product page, collection, or revalidation functionality.",
    "- Keep Shopify-backed behavior intact when Shopify env vars exist.",
    "- Prefer adding fallback data paths for missing Shopify configuration over replacing provider logic.",
    "- Keep generated stores to the supplied 1-3 products.",
    "- Minimize unrelated file modifications.",
    "- Preserve TypeScript correctness and existing import style.",
    "- Prefer controlled visual variation over large UI rewrites.",
    "- The caller runs Prettier before validation; do not spend transformation effort on manual formatting.",
    "- Do not run package install, build, or test commands; the calling script handles verification.",
    "",
    "Completion:",
    "- Summarize modified files and why each change was necessary.",
  ].join("\n");
}

export function buildCommerceRepairPrompt({
  attempt,
  maxAttempts,
  command,
  exitCode,
  stdout,
  stderr,
  modifiedFiles,
}: BuildRepairPromptOptions) {
  return [
    `Repair attempt ${attempt} of ${maxAttempts}.`,
    "",
    "The previous verification command failed.",
    "",
    "Command:",
    command,
    "",
    `Exit code: ${exitCode ?? "unknown"}`,
    "",
    "Modified files so far:",
    modifiedFiles.length ? modifiedFiles.join("\n") : "(none detected)",
    "",
    "stdout:",
    truncateForPrompt(stdout),
    "",
    "stderr:",
    truncateForPrompt(stderr),
    "",
    "Repair guidance:",
    "- Fix only the root cause of the build/test failure.",
    "- Preserve the bounded transformation already requested.",
    "- Do not rewrite core commerce infrastructure.",
    "- Do not remove cart, checkout, Shopify, product page, collection, or revalidation behavior.",
    "- Keep changes minimal and TypeScript-correct.",
    "- Do not spend repair effort on formatting-only failures; the caller runs Prettier before validation.",
    "- Do not run install/build/test commands; the calling script will rerun verification.",
    "",
    "Completion:",
    "- Summarize the files changed for this repair.",
  ].join("\n");
}

function truncateForPrompt(value: string, maxLength = 12000) {
  if (value.length <= maxLength) {
    return value || "(empty)";
  }

  return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]`;
}
