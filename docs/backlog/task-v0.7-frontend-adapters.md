# Task: Implement v0.7 React + Vue Adapters

status: done
owner: tech-lead
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.7-frontend-adapters.md"
story: story-v0.7-frontend-adapters.md

## Parallelization plan
Two independent frontend-engineer tickets — no shared file beyond the
already-frozen `RBACClient` — fanned out per CLAUDE.md's Subagent Fan-Out
rule, same as v0.6:

- **frontend-engineer #1 — rbac-fs/react**: `src/adapters/react/index.tsx`
  + `test/react-adapter.test.ts`
- **frontend-engineer #2 — rbac-fs/vue**: `src/adapters/vue/index.ts`
  + `test/vue-adapter.test.ts`

Shared scaffolding (package.json exports/peerDeps/devDeps, tsconfig
jsx/lib/include changes, build script entries) done once by tech-lead
before fan-out, same reasoning as v0.6.

## Sequenced sub-items (shared, tech-lead)
1. `tsconfig.json`: `jsx: react-jsx`, `lib` += `DOM`, `include` +=
   `src/**/*.tsx`.
2. `package.json`: `./react`/`./vue` exports; `react`/`vue`
   peerDependencies (optional); `react`, `react-test-renderer`, `vue`,
   `@types/react`, `@types/react-test-renderer` devDependencies; build
   script += two entry points.
3. Hand off to frontend-engineer #1 / #2 (parallel).
4. Consolidate: review both for cross-instance conflicts (none expected),
   run `npm run verify` once with both present.

## Acceptance (per ADR §7 / story #6)
- Both adapters call the real `RBACClient.can()` — no reimplemented
  permission logic in either test file.
- `npm run verify` green including unchanged `browser-bundle-smoke.mjs`.

## Status log
- 2026-08-10 — task created, approved. Shared scaffolding done by
  tech-lead. Handed to frontend-engineer #1 (rbac-fs/react) and
  frontend-engineer #2 (rbac-fs/vue) in parallel.
- 2026-08-10 — implemented: `RbacProvider` + `<Can I="approve" a="invoice">`
  + `usePermission()` (React), `createRbacPlugin()` + `v-can` + composable
  `usePermission()` (Vue), both calling straight into the real
  `RBACClient.can()`, zero duplicated logic. `v-can`'s `display:none`
  (`v-show`-like, not `v-if`-like) visibility trade-off documented per ADR
  §5. 27 new tests added, all against real `RBACClient` instances (no
  `can()` mocks) — React via `react-test-renderer`, Vue by invoking the
  directive object directly + a real `App`/`runWithContext` for the plugin/
  composable.
- 2026-08-10 — environment note (not a code bug): this sandbox's npm
  (10.9.8 / Node 22.22.3) hit a reproducible `@npmcli/arborist` crash on
  the v0.7 dependency graph; `pnpm` used as a one-time local workaround to
  populate `node_modules`, no pnpm artifacts committed. See
  `docs/backlog/lessons.md` — `package-lock.json` needs regeneration next
  time this repo is opened in a normal dev environment.
- 2026-08-10 — QA: `npm run verify` — typecheck clean, 131/131 tests green,
  build green (6 entry points), `dist-smoke.mjs` OK, `browser-bundle-
  smoke.mjs` OK (2790 bytes, unchanged — confirms nothing React/Vue-shaped
  leaked into the isomorphic `rbac-fs`/`rbac-fs/client` builds).
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
