# Story: v0.7 — Frontend Adapters Batch 1 (React + Vue)

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-7
plan-ref: "docs/PLAN.md §3.1 (frontend adapter table + priority order), §7 (RBACClient), §9 (v0.7 row)"

## Problem statement
v0.4 shipped `RBACClient` — a synchronous, in-memory, snapshot-based `can()`
for the browser — but every frontend still has to hand-wire it into their
component tree (get the client to the right place, re-check `can()` on
every render, conditionally render UI). `docs/PLAN.md` §3.1 names React and
Vue as the priority-1 frontend adapters ("matches combined market share").

## Requirements (acceptance criteria)
1. `rbac-fs/react` ships an `RbacProvider` (supplies one `RBACClient` to a
   component tree via context), a `<Can I="approve" a="invoice">` component
   (renders children when allowed, an optional `fallback` otherwise — exact
   prop names from `docs/PLAN.md` §3.1's illustrative table row), and a
   `usePermission()` hook returning a `can(resource, action, context?)`
   function for imperative checks outside JSX.
2. `rbac-fs/vue` ships a Vue plugin (`createRbacPlugin(client)`, installed
   via `app.use(...)`) that both provides the client for a `usePermission()`
   composable and registers a global `v-can` directive for declarative
   conditional rendering in templates.
3. Per §3.1's core rule (same as v0.6): **zero permission logic duplicated
   in either adapter** — both call straight into the real `RBACClient.can()`
   built in v0.4. Neither adapter re-implements condition evaluation or
   permission resolution.
4. Both adapters are read-only/synchronous, matching `RBACClient` itself —
   no adapter introduces async permission checks, network calls, or a
   second source of truth for the current permission snapshot.
5. Neither adapter's presence in `node_modules` changes what
   `rbac-fs`/`rbac-fs/client` ship — `react`/`vue` are peerDependencies
   (optional), never bundled into the isomorphic core or client build. The
   existing `browser-bundle-smoke.mjs` (unchanged) must stay green,
   proving this the same way it did for v0.6's `@nestjs/core` finding.
6. Each adapter has its own tests, against a real `RBACClient` instance —
   not a mocked `can()` — same discipline as v0.6's Express/NestJS tests.

## Explicitly out of scope
- Angular, Svelte (v0.9 per roadmap).
- SSR-specific guidance/helpers — §3.1 notes Next.js/Nuxt need no separate
  adapter and only need documented SSR guidance (snapshot fetched
  server-side, hydrated, never read from `.rbac/` during render); that's a
  README/docs task, not a code deliverable of this story.
- Any UI chrome beyond conditional show/hide (loading states, permission-
  denied messaging, etc.) — `<Can>`'s `fallback` prop and `v-can`'s
  visibility toggle are the full scope; anything more elaborate is the
  consuming app's own component, built on `usePermission()`.

## Success metrics
- QA shows: `<Can>` renders its children when `RBACClient.can()` is true
  and its `fallback` (or nothing) when false, verified via React's own
  test renderer against a real `RBACClient`, not a stubbed one.
- QA shows: `v-can` shows/hides its host element correctly for both allow
  and deny cases, verified by invoking the real directive object (not a
  reimplementation of its logic) against a real `RBACClient`.
- `npm run verify` stays green, including `browser-bundle-smoke.mjs`
  unchanged — proving neither adapter leaked into the isomorphic build.

## Approval status
**APPROVED — proceeding to engineering-manager.**
