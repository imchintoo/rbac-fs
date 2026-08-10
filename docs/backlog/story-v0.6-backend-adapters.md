# Story: v0.6 — Backend Adapters Batch 1 (NestJS + Express)

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-6
plan-ref: "docs/PLAN.md §3.1 (adapter strategy table), §9 (v0.6 row), §2 (subpath exports), §11.1 (validation-lives-in-core table)"

## Problem statement
Every phase so far (v0.1–v0.5) built the Core Engine, storage, audit, browser
client, and live-reload — but rbac-fs still has no framework integration.
`docs/PLAN.md` §3.1 names NestJS and Express as the priority-1 backend
adapters ("matches current stack + widest combined install base"). Without
them, every consumer has to hand-roll the `can()` → `403`/`throw` wiring
themselves, which is exactly the boilerplate rbac-fs is supposed to remove.

## Requirements (acceptance criteria)
1. `rbac-fs/express` subpath ships a middleware factory that wraps a
   consumer-provided `RBAC` instance, checks `can(user, resource, action,
   context)` per-request, and calls `next()` on allow or responds `403` (or
   an injected `onDeny` handler) on deny. Resource/action can be static
   strings or per-request functions (so `DELETE /invoices/:id` can compute
   `context` from `req.params`).
2. `rbac-fs/nestjs` subpath ships an `@RequirePermission(resource, action)`
   decorator (method/class-level metadata, `SetMetadata`-based) and an
   `RbacGuard` (`CanActivate`) that reads that metadata, extracts the user
   from the request, calls the injected `RBAC` instance's `can()`, and
   throws `ForbiddenException` on deny.
3. Per §3.1's core rule: **zero permission/validation logic duplicated in
   either adapter** — both call straight into `RBAC.can()`. An adapter unit
   test that asserts a specific allow/deny *outcome* by reimplementing the
   condition logic instead of exercising a real `RBAC` instance is a review
   finding, not a passing test.
4. Both adapters extract the user via a small, overridable hook (default
   `req.user`) — never assume a specific auth middleware (Passport,
   `@nestjs/passport`, custom) populated it a particular way.
5. Per §2.1: no NestJS-only runtime assumption (decorators, `reflect-metadata`)
   leaks into the core `rbac-fs` or `rbac-fs/client` entry points — those
   must stay usable in a plain browser/edge bundle with zero decorator
   runtime, same guarantee `browser-bundle-smoke.mjs` already checks for
   `rbac-fs/client`. `@nestjs/common`/`reflect-metadata`/`express` are
   **peerDependencies** (or peer-like devDependencies for typing only), not
   runtime `dependencies` — a Node consumer who only wants the Express
   adapter must not be forced to install NestJS, and vice versa.
6. Each adapter has its own tests (own file, own subpath) proving the wiring
   against a real `RBAC` instance + `LocalJsonAdapter` fixture — not mocks
   of `can()` itself.

## Explicitly out of scope
- Fastify, Koa, Hapi, Hono (v0.8/v1.1 per roadmap).
- A `RbacModule.forRoot()`-style NestJS module/global provider convenience
  wrapper — v0.6 ships the guard + decorator + a plain DI provider helper;
  a full dynamic module is not blocking and can be added non-breaking later
  if there's real demand.
- Rate limiting, request logging, or any concern beyond permission-check
  wiring — adapters translate, they don't add new behavior (§3.1).

## Success metrics
- QA shows: an Express route wrapped in the middleware returns 200 for an
  allowed user and 403 for a denied one, verified against a real `RBAC`
  instance + fixture `.rbac/` dir (not a stub `can()`).
- QA shows: a NestJS controller method decorated with `@RequirePermission()`
  and guarded by `RbacGuard` behaves identically (allow → handler runs, deny
  → `ForbiddenException`), verified via Nest's `Test.createTestingModule`
  or an equivalent real `ExecutionContext`, not a hand-mocked one.
- `npm run verify` stays green — including the existing browser-bundle
  smoke test, proving the NestJS/Express adapters didn't leak into
  `rbac-fs`/`rbac-fs/client`.

## Approval status
**APPROVED — proceeding to engineering-manager.**
