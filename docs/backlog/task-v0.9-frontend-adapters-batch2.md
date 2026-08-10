# Task: Implement v0.9 Angular + Svelte Adapters

status: done
owner: tech-lead
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.9-frontend-adapters-batch2.md"
story: story-v0.9-frontend-adapters-batch2.md

## Parallelization plan
Two independent frontend-engineer tickets — no shared file — fanned out
per CLAUDE.md's Subagent Fan-Out rule, same as v0.7:

- **frontend-engineer #1 — rbac-fs/angular**: `src/adapters/angular/index.ts`
  + `test/angular-adapter.test.ts`
- **frontend-engineer #2 — rbac-fs/svelte**: `src/adapters/svelte/index.ts`
  + `test/svelte-adapter.test.ts`

Shared scaffolding (package.json exports/peerDeps/devDeps, build script
entries) done once by tech-lead before fan-out.

## Sequenced sub-items (shared, tech-lead)
1. `package.json`: `./angular`/`./svelte` exports; `@angular/core`/`svelte`
   peerDependencies (optional); `@angular/core`, `svelte` devDependencies;
   build script += two entry points.
2. Hand off to frontend-engineer #1 / #2 (parallel).
3. Consolidate: review both for cross-instance conflicts (none expected),
   run `npm run verify` once with both present.

## Acceptance (per ADR §6 / story #6)
- Both adapters call the real `RBACClient.can()` — no reimplemented
  permission logic in either test file.
- `npm run verify` green including unchanged `browser-bundle-smoke.mjs`.

## Status log
- 2026-08-10 — task created, approved. Shared scaffolding done by
  tech-lead. Handed to frontend-engineer #1 (rbac-fs/angular) and
  frontend-engineer #2 (rbac-fs/svelte) in parallel.
- 2026-08-10 — implemented: `RbacService` + `provideRbacClient()` +
  `RbacCanDirective` (`*rbacCan`, real `ViewContainerRef` unmount/remount
  — true `*ngIf`-style behavior, no `display:none` compromise needed here)
  for Angular; `createPermissionStore()` + `createCanAction()` (explicit
  client-factory pattern, not `getContext`, per the ADR's documented
  reasoning) for Svelte. Both call straight into the real
  `RBACClient.can()`. `RbacService`/`RbacCanDirective` use classic
  constructor injection (not field-initializer `inject()`) specifically so
  they're directly constructible in tests without an Angular `Injector`.
  20 new tests added, all against real `RBACClient` instances (no `can()`
  mocks).
- 2026-08-10 — QA: `npm run verify` — typecheck clean on the first pass
  (no framework-specific surprises this round, unlike v0.6/v0.8), 156/156
  tests green, build green (10 entry points), `@angular/core` confirmed
  externalized (not bundled — verified by inspecting `dist/adapters/
  angular/index.js`, important given Angular's singleton-instance DI
  model), `dist-smoke.mjs` OK, `browser-bundle-smoke.mjs` OK (2790 bytes,
  unchanged).
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
