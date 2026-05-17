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
    "- Use StoreBlueprint.products[].imageUrl exactly for fallback product imagery; do not replace supplied image URLs with Unsplash, placeholder, or stock image URLs.",
    "- If supplied image URLs use Vercel Blob hosts such as *.public.blob.vercel-storage.com and the storefront renders them with next/image, update next.config so those remote images are allowed.",
    "- Apply a simple theme/color transformation using existing Tailwind/CSS patterns.",
    "",
    "Known Commerce template map:",
    "- app/page.tsx controls homepage hero, featured grid, and carousel composition.",
    "- app/layout.tsx controls root metadata and global document structure.",
    "- app/globals.css controls template-level CSS variables and theme treatment.",
    "- components/layout/navbar/index.tsx controls header branding/navigation.",
    "- components/layout/footer.tsx controls footer brand and footer merchandising copy.",
    "- components/opengraph-image.tsx and app/[page]/opengraph-image.tsx control OG imagery text.",
    "- lib/shopify/index.ts contains Shopify data access and is the safest place to add fallback behavior when env vars are missing.",
    "- Add new fallback catalog data under lib/shopify/fallback-data.ts if needed.",
    "- next.config.ts, next.config.mjs, or next.config.js controls Next.js image remotePatterns when next/image is used.",
    "",
    "Image handling rules:",
    "- Product featuredImage.url values in fallback data must come from the StoreBlueprint product imageUrl fields.",
    "- Hero/product cards should render the supplied hosted product images, especially Vercel Blob URLs.",
    "- Do not invent replacement image URLs.",
    "- When using next/image with Vercel Blob URLs, preserve existing image config and add a remote pattern equivalent to:",
    "  images: {",
    "    remotePatterns: [",
    "      {",
    "        protocol: 'https',",
    "        hostname: '*.public.blob.vercel-storage.com',",
    "        pathname: '/stores/**',",
    "      },",
    "    ],",
    "  }",
    "- If the existing config already has images.remotePatterns, append this pattern without removing existing allowed hosts.",
    "- If the Commerce template uses a different config filename, update the existing config file rather than creating a duplicate.",
    "",
    "Layout and spacing rules:",
    "- Preserve the Vercel Commerce layout rhythm on homepage, search/product-listing pages, and product-detail pages.",
    "- Header/nav branding must not collide with, overlap, or sit flush against product grids, filters, search results, or PDP content.",
    "- If branding changes increase header height, add or preserve responsive vertical spacing below the header using existing layout containers and Tailwind spacing utilities.",
    "- Product listing/search pages should keep clear top padding between the nav/search bar and product grid/sidebar controls, matching the base template feel.",
    "- Product detail pages should keep clear top padding between the nav/search bar and the product media/details section, matching the base template feel.",
    "- Do not solve spacing by hiding navigation, cart, filters, product cards, or PDP content.",
    "- Prefer small container/class adjustments in the relevant route or layout component over broad CSS rewrites.",
    "",
    "Performance constraints:",
    "- Treat the Commerce template structure above as known; do not do a broad repository survey.",
    "- Inspect only the listed files unless a direct import/type error requires another file.",
    "- Use the local repository files in the current workspace; do not use web search or GitHub raw URLs to inspect Commerce source.",
    "- If local file reads fail, stop and report the filesystem access problem instead of searching the web.",
    "- Prefer editing 5-10 focused files over touching many components.",
    "- Avoid reading large unrelated files, package internals, generated output, or node_modules.",
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
