# ADR 0003: Split Blueprint Generation Into Phases

## Status

Accepted

## Context

Generating a full StoreBlueprint in one request can make the approval page feel
slow, especially when product concepts and product image prompts take longer
than brand naming and visual direction. Users need visible progress quickly so
the demo feels alive before repository generation begins.

## Decision

Split blueprint generation into explicit phases:

- Brand concept: Generate the store identity, audience, visual direction,
  palette, catalog strategy, and hero image direction.
- Product catalog: Generate the product set, hero product, prices, handles,
  descriptions, and product image prompts.
- Full blueprint: Generate both phases when the caller needs a complete
  blueprint in one operation or when fallback behavior is required.

The store row remains the source of truth. Each phase validates with the
StoreBlueprint schema before persisting.

## Consequences

- The approval page can render brand content earlier and show skeletons for
  product fields.
- Product concept regeneration can keep the brand and theme stable.
- Image generation can be framed as a clear step after product concepts are
  ready.
- The blueprint workflow module owns phase decisions so API routes do not need
  to know generator internals.
