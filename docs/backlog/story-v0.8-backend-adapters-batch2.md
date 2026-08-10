# Story: v0.8 — Backend Adapters Batch 2 (Fastify + Koa)

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-8
plan-ref: "docs/PLAN.md §3.1 (adapter strategy table + priority order), §9 (v0.8 row)"

## Problem statement
v0.6 covered NestJS + Express (priority-1 backend frameworks). `docs/PLAN.md`
§3.1 names Fastify and Koa as priority-2 ("Koa/Hapi/Hono as community-driven
or later phases — don't block v1.0 on all six", with Fastify/Koa explicitly
grouped ahead of Hapi/Hono). Same underlying gap as v0.6: without these,
Fastify/Koa consumers hand-roll the `can()` wiring themselves.

## Requirements (acceptance criteria)
1. `rbac-fs/fastify` ships a Fastify plugin (registered via
   `app.register(rbacPlugin, { rbac })`) that decorates requests with a
   permission-check capability, using Fastify's `onRequest` hook lifecycle
   (per §3.1's illustrative integration shape) rather than a generic
   Express-style middleware bolted on. Route-level permission requirements
   are declared via Fastify's own native route-schema/config mechanism
   (`config: { rbac: { resource, action } }` on the route definition) —
   per §3.1's "native JSON Schema validation for permission-check payloads"
   guidance, reusing Fastify's own route-config idiom rather than inventing
   a parallel registration API.
2. `rbac-fs/koa` ships `ctx`-based async middleware
   (`rbacMiddleware(rbac, resource, action, options?)` returning a Koa
   middleware `async (ctx, next) => {...}`) — native async/await, no
   `next(err)` callback-style error propagation (Koa's own convention:
   throw to signal an error, `await next()` to continue).
3. Per §3.1's core rule (same as v0.6/v0.7): **zero permission logic
   duplicated in either adapter** — both call straight into the real
   `RBAC.can()`.
4. Both adapters extract the user via a small, overridable hook (default
   `request.user` for Fastify, `ctx.state.user` for Koa — each framework's
   own idiomatic convention for where auth middleware typically stores the
   authenticated user) — never assume a specific auth plugin/middleware.
5. Per §2.1/v0.6's established pattern: `fastify`/`koa` are peerDependencies
   (optional) — installing rbac-fs doesn't force either framework's
   install, and neither leaks into the isomorphic core/client build
   (`browser-bundle-smoke.mjs` must stay green, unchanged).
6. Each adapter has its own tests, against a real `RBAC` instance +
   `LocalJsonAdapter` fixture — not a mocked `can()` — same discipline as
   v0.6.

## Explicitly out of scope
- Hapi, Hono (v1.1 per roadmap).
- Fastify: a full JSON Schema *body/params validator* for arbitrary route
  payloads — this story only uses Fastify's schema/config mechanism to
  declare which `(resource, action)` a route requires, not a general
  request-validation feature (that's Fastify's own `schema.body`, already
  built into the framework, orthogonal to this adapter).

## Success metrics
- QA shows: a Fastify route configured with `{ rbac: { resource, action } }`
  returns the handler's response for an allowed user and `403` for a denied
  one, verified against a real `RBAC` instance + fixture `.rbac/` dir.
- QA shows: a Koa route wrapped in `rbacMiddleware` behaves identically
  (allow → downstream middleware runs, deny → `403`, thrown adapter error →
  propagates as a real thrown error, not swallowed), verified the same way.
- `npm run verify` stays green, including unchanged `browser-bundle-
  smoke.mjs`.

## Approval status
**APPROVED — proceeding to engineering-manager.**
