# StoreForge Context

StoreForge turns a short commerce idea into a deployed ecommerce storefront by
generating a store blueprint, creating product imagery, transforming a stable
Next.js Commerce template, validating the build, pushing generated code to
GitHub, and deploying it to Vercel.

## Domain Language

- Store: The user-facing generated storefront concept and its persisted record.
- Store blueprint: The structured brand, theme, product, and imagery plan used
  before repository generation begins.
- Brand concept: The first blueprint phase. It produces the brand name, tagline,
  audience, visual direction, color palette, catalog strategy, and image prompt
  direction quickly so the approval page can render early.
- Product catalog: The second blueprint phase. It produces 1-7 products, a hero
  product, product image prompts, prices, handles, and merchandising copy.
- Product assets: Generated product images and metadata stored before Commerce
  transformation. Blob URLs from this phase should be used by the generated
  storefront.
- Commerce template: The Vercel Commerce repository used as the stable base app.
- Sandbox generation: The Vercel Sandbox execution path that prepares Commerce,
  runs Codex, validates the build, and optionally publishes the result.
- Live preview: A best-effort Commerce dev server exposed from the sandbox so
  the user can watch the store change while generation is running.
- Repository artifact: The generated GitHub repository containing the
  transformed Commerce app.
- Production deployment: The Vercel deployment created from the generated GitHub
  repository.
- Workflow event: A concise persisted progress record shown on the status page.
- Workflow run: The persisted orchestration state for one generation attempt.

## Product Constraints

- Generated stores contain 1-7 products.
- Preserve core Commerce infrastructure, checkout, cart, routing, and data
  contracts.
- Focus Codex changes on branding, imagery, merchandising, homepage content,
  product catalog data, theme, and page spacing.
- Prefer controlled variation over broad UI rewrites.
- Keep repository transformation reliable before making it novel.
- Product pages and product listing pages should keep the base Commerce spacing
  quality, especially clear margin from the navigation and viewport edges.

## Architecture

- Next.js app routes and server actions own the user experience, authentication,
  blueprint approval, image generation, and status pages.
- Supabase stores are the source of truth for store records, workflow runs,
  workflow events, deployment metadata, and generated artifact metadata.
- Clerk provides user identity; local development may use the existing dev-user
  fallback where the app already supports it.
- Vercel Blob stores generated product imagery.
- The blueprint workflow owns the phased LLM generation contract.
- The generation runner chooses the local or sandbox generation runtime.
- The sandbox runtime owns app-side sandbox paths, sandbox credentials, source
  selection, and the environment passed into the sandbox job.
- The sandbox job script is standalone JavaScript executed inside the sandbox.
- GitHub and Vercel adapters own app-side publishing API calls and should read
  publishing settings through the publishing configuration module.
- The workflow status view module turns persisted workflow state into UI-ready
  status, timeline, preview, and activity data.

## Reliability Rules

- Keep Codex prompts bounded and explicit about preserving Commerce behavior.
- Validation is build-first: run the Commerce build after transformation and run
  at most two repair attempts.
- Logs should be concise, masked, and persisted as workflow events.
- Deployment tokens must only be available to controlled publishing commands,
  not to general Codex exploration.
- Live preview is best-effort. Preview failure should not fail generation.
