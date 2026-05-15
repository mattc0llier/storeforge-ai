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

## Codex SDK Rules

- Never invent SDK APIs
- Inspect installed package types first
- Keep SDK logic inside `lib/codex`
- Stream agent progress into workflow logs

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
  `pnpm prettier --write --ignore-unknown .`
- Then run `pnpm build` and `pnpm test`.
- Capture and persist enough stdout/stderr to reveal the real failing file or
  exception. Do not reduce failures to `ELIFECYCLE` or a wrapper error.
- Treat fallback menu/product/page log lines as diagnostic context, not a
  failure by themselves. The command exit code and nearby error output are the
  source of truth.

If a repair loop is needed, give Codex the exact failed command, exit code,
recent stdout/stderr tail, and modified file list. Prefer small, targeted
repairs over broad re-transformation. After each repair, format before
re-running build/test. Do not spend a repair attempt on formatting-only drift;
make formatting a deterministic pipeline step.
