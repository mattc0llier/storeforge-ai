# ADR 0002: Use GitHub-Backed Vercel Deployments

## Status

Accepted

## Context

The StoreForge demo needs deployed storefronts that users can inspect, share,
and trace back to generated source code. Direct deployment from a temporary
sandbox would make the generated artifact harder to inspect and harder to
repair after the sandbox expires.

GitHub-backed Vercel deployments match the product story: autonomous repository
transformation creates real code, pushes it to a repository, and deploys it.

## Decision

After Codex transformation and Commerce build validation succeed, StoreForge
creates a generated GitHub repository, commits and pushes the transformed
Commerce app, creates or links a Vercel project to that repository, triggers a
production deployment, and persists the resulting URLs.

Generated repository names use:

`storeforge-{store-slug}-{storeId8}`

Publishing configuration is read through the StoreForge publishing configuration
module and passed into the sandbox job only when deployment is enabled.

## Consequences

- Generated code is durable and inspectable after the sandbox exits.
- Vercel deployments are connected to GitHub history and can be redeployed.
- StoreForge needs a GitHub token with repository creation and push permission.
- StoreForge needs a Vercel token whose account or team can access repositories
  under the configured GitHub owner.
- Deployment is slower than a direct sandbox upload, but more aligned with the
  demo and product architecture.
- Deployment metadata must include GitHub repository URLs, Vercel project IDs,
  deployment URLs, and production URLs when available.
