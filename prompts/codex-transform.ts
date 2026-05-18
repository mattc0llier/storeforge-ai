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
    "- components/cart/actions.ts contains server actions for add/remove/update/checkout and delegates to lib/shopify.",
    "- components/cart/add-to-cart.tsx resolves the selected variant ID and submits it to the addItem server action.",
    "- components/cart/cart-context.tsx contains the optimistic client cart shape that the fallback cart should remain compatible with.",
    "- components/cart/modal.tsx renders cart lines, quantity controls, and checkout state.",
    "- lib/shopify/types.ts defines the Cart, CartItem, Product, and ProductVariant shapes used by both Shopify and fallback products.",
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
    "Cart and checkout preservation rules:",
    "- The real Vercel Commerce demo uses real Shopify product variant IDs; Add To Cart submits the selected ProductVariant.id to components/cart/actions.ts, which calls lib/shopify.addToCart and persists the cart through Shopify.",
    "- StoreForge fallback products use generated variant IDs such as fallback-variant-*; these must not be sent to Shopify mutations when Shopify is unconfigured or when the selected variant belongs to the fallback catalog.",
    "- Preserve the existing Shopify cart, checkout, cookie, cache tag, and mutation behavior exactly when Shopify environment variables are configured and the merchandise ID is a real Shopify ID.",
    "- Add a tiny demo-safe fallback cart path for unconfigured Shopify/fallback catalog mode so every generated product detail page can be added to the cart without returning \"Error adding item to cart\".",
    "- Prefer implementing fallback cart behavior in lib/shopify/index.ts, backed by lib/shopify/fallback-data.ts, so createCart, getCart, addToCart, removeFromCart, and updateCart return the same Cart shape used by the existing cart modal and cart context.",
    "- The fallback cart may be cookie-backed and minimal; it only needs to support the generated 1-3 products, quantity changes, removal, cart badge/modal rendering, and a non-crashing checkout action.",
    "- If checkout cannot be completed in fallback mode, keep the checkout UI non-crashing and use a clearly safe placeholder checkoutUrl such as \"/\" rather than throwing.",
    "- Do not remove Add To Cart, hide the cart, disable product pages, or bypass the existing optimistic cart context to mask cart errors.",
    "- Validation expectation: clicking Add To Cart on each generated fallback product should update or preserve the cart UI and should not surface \"Error adding item to cart\".",
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
    "Responsive navigation rules:",
    "- Preserve the base Commerce responsive navigation behavior across desktop, tablet, and mobile widths.",
    "- Do not remove, hide, replace, or break the existing mobile menu trigger/button. The compact menu button must remain visible and usable on small screens.",
    "- Keep the cart trigger, search control, logo/brand link, and menu trigger reachable without overlap at mobile widths.",
    "- Header brand text and nav labels must be short enough to fit the available nav space. Prefer concise labels such as \"Shop\", \"All\", \"New\", \"Kits\", \"Gear\", \"Care\", \"About\", or a two-word maximum.",
    "- Do not generate long navigation items such as full product category sentences, long collection names, or repeated brand/tagline copy in the navbar.",
    "- If the StoreBlueprint brand name is long, keep the full name in hero/footer copy but use a shortened navbar wordmark or compact brand treatment that preserves responsiveness.",
    "- On small screens, prefer the existing mobile drawer/menu pattern over forcing all nav items to stay visible.",
    "- After editing navigation, reason through at least these viewport widths: 390px mobile, 768px tablet, and 1280px desktop. The header must not overlap, truncate awkwardly, or push the product grid/PDP content flush against the nav.",
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
    "- If the failure involves Add To Cart with generated fallback products, preserve Shopify behavior and add/fix the fallback cart path instead of disabling cart UI.",
    "- Fallback variant IDs such as fallback-variant-* must not be sent to Shopify mutations in unconfigured Shopify mode.",
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
