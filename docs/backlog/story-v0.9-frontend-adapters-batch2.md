# Story: v0.9 — Frontend Adapters Batch 2 (Angular + Svelte)

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-9
plan-ref: "docs/PLAN.md §3.1 (frontend adapter table + priority order), §9 (v0.9 row)"

## Problem statement
v0.7 covered React + Vue (priority-1 frontend frameworks). `docs/PLAN.md`
§3.1 names Angular and Svelte as priority-2 ("Priority order: React → Vue
→ Angular → Svelte"). Same gap as v0.7: without these, Angular/Svelte
consumers hand-wire `RBACClient` into their component tree themselves.

## Requirements (acceptance criteria)
1. `rbac-fs/angular` ships an `RbacService` (Angular DI-injectable,
   wrapping one `RBACClient`) and a `*rbacCan` structural directive
   (`<button *rbacCan="'invoice'; action: 'approve'">...</button>`,
   Angular's own idiom for conditional rendering — DI-based, matching
   §3.1's "DI-based, matches Angular idioms" guidance) for declarative
   conditional rendering in templates.
2. `rbac-fs/svelte` ships a permissions store (`createPermissionStore(client)`
   returning a readable-ish accessor consistent with Svelte's store
   contract) and a `can` action (`use:can={{ a: 'invoice', I: 'approve' }}`,
   Svelte's own idiom for imperative DOM behavior attached to an element)
   for conditional visibility, matching §3.1's "a Svelte store (`$permissions`)
   + a `can()` action" description.
3. Per §3.1's core rule (same as v0.6/v0.7/v0.8): **zero permission logic
   duplicated in either adapter** — both call straight into the real
   `RBACClient.can()` built in v0.4. Neither adapter re-implements
   condition evaluation or permission resolution.
4. Both adapters are read-only/synchronous, matching `RBACClient` itself —
   consistent with v0.7's frontend adapters.
5. Neither adapter's presence in `node_modules` changes what
   `rbac-fs`/`rbac-fs/client` ship — `@angular/core`/`svelte` are
   peerDependencies (optional), never bundled into the isomorphic core or
   client build. `browser-bundle-smoke.mjs` (unchanged) must stay green.
6. Each adapter has its own tests, against a real `RBACClient` instance —
   not a mocked `can()` — same discipline as v0.7.

## Explicitly out of scope
- Any framework beyond React/Vue/Angular/Svelte — v0.9 completes §3.1's
  frontend adapter table; v1.1+ (Hapi/Hono-equivalent "later, community-
  driven" frontend frameworks) is not scoped here since §3.1 doesn't list
  any beyond these four.
- SSR-specific guidance beyond what v0.7 already established (still a
  README/docs task, not a code deliverable).

## Success metrics
- QA shows: `*rbacCan` shows/hides its host element correctly for both
  allow and deny cases, verified against a real `RBACClient` via Angular's
  own `TestBed`, not a hand-rolled directive-logic reimplementation.
- QA shows: Svelte's `can` action attaches/detaches visibility correctly,
  and the permissions store returns results consistent with a real
  `RBACClient.can()` call, verified without mocking `can()`.
- `npm run verify` stays green, including `browser-bundle-smoke.mjs`
  unchanged — proving neither adapter leaked into the isomorphic build.

## Approval status
**APPROVED — proceeding to engineering-manager.**
