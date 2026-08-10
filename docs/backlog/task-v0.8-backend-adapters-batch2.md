# Task: Implement v0.8 Fastify + Koa Adapters

status: done
owner: tech-lead
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.8-backend-adapters-batch2.md"
story: story-v0.8-backend-adapters-batch2.md

## Parallelization plan
Two independent backend-engineer tickets — no shared file — fanned out per
CLAUDE.md's Subagent Fan-Out rule, same as v0.6:

- **backend-engineer #1 — rbac-fs/fastify**: `src/adapters/fastify/index.ts`
  + `test/fastify-adapter.test.ts`
- **backend-engineer #2 — rbac-fs/koa**: `src/adapters/koa/index.ts`
  + `test/koa-adapter.test.ts`

Shared scaffolding (package.json exports/peerDeps/devDeps, build script
entries) done once by tech-lead before fan-out.

## Sequenced sub-items (shared, tech-lead)
1. `package.json`: `./fastify`/`./koa` exports; `fastify`/`koa`
   peerDependencies (optional); `fastify`, `koa`, `@types/koa` (+
   `fastify-plugin`, added mid-implementation — see status log)
   devDependencies; build script += two entry points.
2. Hand off to backend-engineer #1 / #2 (parallel).
3. Consolidate: review both for cross-instance conflicts (none expected),
   run `npm run verify` once with both present.

## Acceptance (per ADR §7 / story #6)
- Both adapters call the real `RBAC.can()` — no reimplemented permission
  logic in either test file.
- `npm run verify` green including unchanged `browser-bundle-smoke.mjs`.

## Status log
- 2026-08-10 — task created, approved. Shared scaffolding done by
  tech-lead. Handed to backend-engineer #1 (rbac-fs/fastify) and
  backend-engineer #2 (rbac-fs/koa) in parallel.
- 2026-08-10 — implemented: `rbacPlugin` (Fastify, `onRequest` hook +
  route `config.rbac`) and `rbacMiddleware` (Koa, async/await native, no
  `next(err)` translation needed), both calling straight into the real
  `RBAC.can()`.
- 2026-08-10 — QA: found a real bug in the Fastify adapter by writing
  a real Fastify app + real sibling routes (not a mock): the plugin's
  `addHook()` never fired for routes registered on the parent app after
  `app.register(rbacPlugin, ...)` — Fastify's plugin encapsulation, not a
  permission-logic bug. Root cause confirmed with a throwaway debug
  script. Fixed by wrapping the plugin in `fastify-plugin`'s `fp()`
  (bundled at build time, devDependency only — confirmed via inspecting
  `dist/adapters/fastify/index.js`, no external unresolved import).
  Logged in `docs/backlog/lessons.md` and the ADR's addendum.
- 2026-08-10 — `npm run verify`: typecheck clean, 141/141 tests green,
  build green (8 entry points), `dist-smoke.mjs` OK, `browser-bundle-
  smoke.mjs` OK (2790 bytes, unchanged).
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
