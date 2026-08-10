# Task: Implement v0.6 Express + NestJS Adapters

status: done
owner: tech-lead
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.6-backend-adapters.md"
story: story-v0.6-backend-adapters.md

## Parallelization plan
Two independent backend-engineer tickets — no shared file, no shared
contract beyond the already-frozen public `RBAC`/`RbacUser` types. Per
CLAUDE.md's Subagent Fan-Out rule (framework adapters are the canonical
example given), these run as parallel instances:

- **backend-engineer #1 — rbac-fs/express**: `src/adapters/express/index.ts`
  + `test/express-adapter.test.ts`
- **backend-engineer #2 — rbac-fs/nestjs**: `src/adapters/nestjs/index.ts`
  + `test/nestjs-adapter.test.ts`

Shared/cross-cutting items (package.json exports + peerDeps + build script
entries) are done once, by tech-lead, before fan-out starts — both tickets
depend on that scaffolding but don't touch it themselves, avoiding a merge
collision on the one genuinely shared file.

## Sequenced sub-items (shared, tech-lead)
1. `package.json`: add `./express`, `./nestjs` to `exports`; add
   `peerDependencies`/`peerDependenciesMeta` (express, @nestjs/common);
   add `express`, `@nestjs/common`, `@nestjs/core`, `@nestjs/testing`,
   `reflect-metadata`, `@types/express` to `devDependencies`; extend
   `build` script with the two new entry points.
2. Hand off to backend-engineer #1 / #2 (parallel).
3. Consolidate: review both for cross-instance conflicts (none expected —
   different files), run `npm run verify` once with both present.

## Acceptance (per ADR §7 / story #6)
- Both adapters call the real `RBAC.can()` — no reimplemented permission
  logic in either test file.
- `npm run verify` green including unchanged `browser-bundle-smoke.mjs`.

## Status log
- 2026-08-10 — task created, approved. Shared scaffolding (package.json,
  build script) done by tech-lead. Handed to backend-engineer #1
  (rbac-fs/express) and backend-engineer #2 (rbac-fs/nestjs) in parallel.
- 2026-08-10 — implemented: `rbacMiddleware(rbac, resource, action,
  options?)` (Express) and `@RequirePermission()` + `RbacGuard` +
  `provideRbac()` (NestJS), both calling straight into a real `RBAC.can()`,
  zero duplicated permission logic. 14 new tests added, all against real
  `RBAC` + `LocalJsonAdapter` fixtures (no `can()` mocks).
- 2026-08-10 — QA: found two real bugs only visible by actually running the
  build, not by typecheck: (1) `tsup`/`esbuild` doesn't emit NestJS's
  `design:paramtypes` DI metadata without `@swc/core` — fixed by making
  every `RbacGuard` constructor param an explicit `@Inject()`, regression-
  tested via a real `Test.createTestingModule`; (2) `@nestjs/core` was
  under-classified as devDependency-only, so esbuild tried to bundle it
  (and its own unmet optional peers) instead of externalizing it — fixed by
  moving it to `peerDependencies` (optional), alongside `@nestjs/common`/
  `express`. Both logged to `docs/backlog/lessons.md`.
- 2026-08-10 — `npm run verify`: typecheck clean, 118/118 tests green,
  build green (4 entry points), `dist-smoke.mjs` OK, `browser-bundle-
  smoke.mjs` OK (2790 bytes, unchanged — confirms nothing NestJS/Express-
  shaped leaked into the isomorphic `rbac-fs`/`rbac-fs/client` builds).
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
