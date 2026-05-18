# ADR 0001: Use Vercel Sandbox For Store Generation

## Status

Accepted

## Context

StoreForge needs to transform a production-grade Next.js Commerce repository,
run package installation, execute Codex, serve a live preview, run build
validation, and optionally publish generated code. This work requires a real
filesystem, process execution, long-running commands, and isolated access to an
untrusted generated workspace.

The Vercel serverless runtime is not a good fit for this work. It does not
provide a dependable full toolchain for cloning, editing, building, previewing,
and publishing arbitrary repositories inside one request lifecycle.

## Decision

Use Vercel Sandbox as the primary generation runtime.

The StoreForge app starts a sandbox from the Commerce snapshot or source,
passes only the required job environment, writes the blueprint, product assets,
prompt, and sandbox job script, then launches the sandbox job detached. The
sandbox job runs the Commerce transformation, build validation, repair loop, and
optional publishing. Progress is persisted back to Supabase as workflow events
and workflow run metadata.

## Consequences

- The app remains the control plane, while the sandbox owns repository execution.
- The sandbox job script must stay self-contained because it runs as plain Node.js
  inside the sandbox.
- Sandbox configuration should stay in a small app-side module so paths,
  credentials, source selection, and job environment are easy to audit.
- Live preview can run inside the sandbox and be exposed to the authenticated
  StoreForge status page.
- Preview failure is non-fatal because it is only feedback, not validation.
- GitHub and Vercel publishing tokens are passed only to the controlled
  post-build publishing step.
