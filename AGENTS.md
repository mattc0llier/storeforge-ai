# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Project Goal

StoreForge AI turns a business idea into a deployed ecommerce storefront using autonomous repository transformation.

The core demo is:

- Codex operating on a real Next.js Commerce repository
- visible agent execution
- successful deployment to Vercel

---

## Core Principles

### Preserve Stability

Do not rewrite core commerce infrastructure.

Focus on:

- branding
- imagery
- merchandising
- homepage content
- theme/colors
- product catalog

Avoid:

- checkout/cart rewrites
- major architecture changes
- unnecessary dependencies

---

## Bounded Autonomy

Agents may:

- inspect files
- edit files
- run tests/builds
- repair failures

Agents should:

- make minimal necessary changes
- preserve TypeScript correctness
- preserve responsive UX

---

## Codex Execution Rules

- Run repository transformation through the Codex CLI inside Vercel Sandbox
- Never invent Codex CLI flags or SDK APIs
- Keep Codex execution logic inside the sandbox generation modules
- Stream Codex JSON events into workflow logs

---

## Repair Loop

If build/test fails:

1. capture errors
2. attempt repair
3. run formatter
4. rerun build/test

Maximum 2 repair attempts.

---

## Product Constraints

Generated stores should:

- contain 1-7 products
- feel visually unique through branding and imagery
- preserve the base commerce UX quality

Prefer controlled variation over large UI rewrites.

---

## Workflow Priorities

Priority order:

1. reliable Codex repo transformation
2. successful build/test
3. successful Vercel deployment
4. clear workflow visibility
5. UI polish

Do not sacrifice reliability for novelty.

---

## Production Feedback Loop

When rebuilding StoreForge from scratch, add the production feedback loop early.
It is part of the demo spine, not polish.

Set up:

- a lightweight health route such as `/api/health/check`
- GitHub-backed Vercel deployment from the first working scaffold
- valid local Vercel CLI auth
- documented `vercel link`, `vercel env pull .env.local`, and `pnpm dev`
- enough persisted workflow error context to correlate UI failures with Vercel
  runtime logs

Use `vercel inspect`, `vercel logs`, and the health route as soon as production
exists. Production-only failures, especially missing runtime binaries or
serverless filesystem assumptions, should be caught before building deeper
product features.

---

## Performance Priorities

The Vercel Commerce template is a known, repeated input. Do not make Codex
rediscover the entire repository on every generation.

Prefer:

- cached prepared Commerce templates over fresh network clone/install work
- prepared Vercel Sandbox snapshots with Commerce dependencies already
  installed
- running expensive clone/install/Codex/build work inside a sandbox or worker,
  while the web function only starts the job and observes persisted state
- compact template maps in prompts
- deterministic StoreForge code for known fallback catalog/theme scaffolding
- narrow Codex edits against known files
- targeted repair prompts with exact failure context

Avoid:

- broad repo scans before every transformation
- relying on Vercel Function runtime binaries such as `git` for repository
  transformation work
- reading `node_modules`, generated output, or unrelated template internals
- asking Codex to perform deterministic formatting or boilerplate work
- large creative rewrites when a known patch point exists

---

## Commerce Transformation Rules

StoreForge transforms a real Vercel Commerce repository, so reliability matters
more than novelty. Keep changes bounded to branding, homepage messaging, theme
tokens, product/catalog fallback data, and light merchandising UI. Do not rewrite
checkout, cart architecture, core Shopify abstractions, routing infrastructure,
or the base template shape unless the user explicitly asks.

When validating a generated Commerce workspace:

- Run the repo build and test commands from the generated workspace, not from
  the StoreForge app workspace.
- For the current Commerce template, `pnpm test` is `prettier --check`; a
  failed test may only mean formatting drift, not broken product behavior.
- Always run formatting before every validation pass:
  `pnpm exec prettier --write --ignore-unknown .`
- Then run `pnpm build` and `pnpm test`.
- Run Commerce install/build/test commands with a clean child process
  environment. Do not inherit StoreForge's Next dev server variables such as
  `NODE_ENV`, `NODE_OPTIONS`, `NEXT_*`, or Turbopack internals into the Commerce
  build.
- Capture and persist enough stdout/stderr to reveal the real failing file or
  exception. Do not reduce failures to `ELIFECYCLE` or a wrapper error.
- Persist the exact failed command output separately when validation ultimately
  fails, so the UI can show the true stdout/stderr instead of only a summary.
- Treat fallback menu/product/page log lines as diagnostic context, not a
  failure by themselves. The command exit code and nearby error output are the
  source of truth.

If a repair loop is needed, give Codex the exact failed command, exit code,
recent stdout/stderr tail, and modified file list. Prefer small, targeted
repairs over broad re-transformation. After each repair, format before
re-running build/test. Do not spend a repair attempt on formatting-only drift;
make formatting a deterministic pipeline step.

If `pnpm build` exits non-zero but only reports wrapper output such as
`ELIFECYCLE` without an actionable compiler/runtime error, retry the same build
once before spending a repair attempt. After the maximum repair attempts are
used, run one final clean validation pass (`rm -rf .next`, then format, build,
and test) before marking the workflow failed. This protects against stale build
state and transient false negatives.
