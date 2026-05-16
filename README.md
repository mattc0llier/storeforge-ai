# StoreForge AI

StoreForge AI turns a business idea into a deployed ecommerce storefront using autonomous repository transformation.

This repository contains the StoreForge demo spine: blueprint approval, Supabase-backed generation jobs, Codex repository transformation spikes, and a lightweight TypeScript generation runner.

## App Routes

- `/dashboard` - operational overview
- `/create-store` - prompt-to-blueprint flow
- `/store-status` - shortcut to demo status
- `/stores/[storeId]` - launch approval screen
- `/stores/[storeId]/status` - dynamic status route

## Structure

- `src/app` - Next.js App Router pages and layouts
- `src/components` - shared app shell and shadcn/ui components
- `src/lib/db` - Zod schemas and Supabase database types
- `src/lib/supabase` - lazy Supabase client factories
- `src/lib/codex` - Codex repository execution boundary
- `src/lib/github` - generated repository boundary
- `src/lib/vercel` - deployment automation boundary
- `src/lib/blob` - generated asset storage boundary
- `src/lib/store-generation` - request validation, generation planning, and the Commerce transformation runner
- `prompts` - Codex repository transformation prompts
- `supabase/schema.sql` - minimal database schema
- `supabase/migrations` - incremental schema updates
- `tests` - placeholder test plan

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The scaffold uses Clerk, Supabase, Tailwind, shadcn/ui, Zod, and the Codex TypeScript SDK. Final GitHub repository creation, durable cloud orchestration, and Vercel deployment automation are still TODOs.

Apply the Supabase schema before launching stores. If you already applied the initial schema, also run:

```sql
-- supabase/migrations/0002_workflow_run_observability.sql
```

Launch flow:

1. Create a store from `/create-store`.
2. Review `/stores/[storeId]`.
3. Click `Launch Store`.
4. Watch `/stores/[storeId]/status` for workspace, Codex, build, repair, and artifact progress.

## Codex SDK Spike

Run the minimal filesystem modification spike with:

```bash
npm run codex:spike
```

Required environment:

- `CODEX_API_KEY` - required unless your local Codex CLI is already authenticated
- `CODEX_MODEL` - optional model override
- `CODEX_BASE_URL` - optional API base URL override

Expected output:

- a temporary workspace path
- streamed Codex event logs such as `thread.started`, `item.completed`, and `turn.completed`
- a final JSON summary with `success: true`, the changed file path, event count, thread id, and token usage

## Commerce Transformation Spike

Run the first real repository transformation spike with:

```bash
npm run commerce:spike
```

The script clones `vercel/commerce` into a temporary workspace, installs dependencies, asks Codex to apply a bounded StoreForge transformation, runs `pnpm build` and `pnpm test`, and gives Codex up to two repair attempts if verification fails.

Expected output:

- modified files summary
- build/test result
- repair attempts used
- temporary workspace path

## Vercel Project Runbook

Link this checkout to the existing Vercel project:

```bash
vercel link
```

Pull project environment variables into local development:

```bash
vercel env pull .env.local
```

Start the local app:

```bash
pnpm dev
```

The production app should expose a lightweight health route at:

```text
/api/health/check
```
