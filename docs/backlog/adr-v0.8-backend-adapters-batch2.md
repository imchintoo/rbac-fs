# ADR: v0.8 — Fastify + Koa Adapter Design

status: approved
owner: solutions-architect
created: 2026-08-10
story: story-v0.8-backend-adapters-batch2.md
plan-ref: "docs/PLAN.md §3.1, docs/backlog/adr-v0.6-backend-adapters.md (established pattern this phase extends)"

## Decision

### 1. Source layout
```
src/adapters/
├── fastify/index.ts   → rbac-fs/fastify
└── koa/index.ts       → rbac-fs/koa
```
Same pattern as v0.6/v0.7 — both call straight into a structurally-typed
`RbacLike.can()`, never `core/` directly, never reimplement permission
logic.

### 2. Fastify adapter shape — plugin + route `config.rbac`, verified against the real installed types
Confirmed against the actual installed `fastify@5.11.3` types (not
assumed from `docs/PLAN.md`'s prose alone — same "verify against the real
thing" discipline as every prior phase's lessons.md entries):
`FastifyRequest.routeOptions.config` is a real, typed field (`fastify/
types/request.d.ts`) carrying whatever object was passed as `config` on
the route definition. §3.1 says "native JSON Schema validation for
permission-check payloads" — read as "use Fastify's own route-config
mechanism to declare a route's permission requirement," not "invent a new
adapter-specific registration API":
```typescript
import { rbacPlugin } from 'rbac-fs/fastify';

app.register(rbacPlugin, { rbac });

app.get('/invoices/:id/approve', {
  config: { rbac: { resource: 'invoice', action: 'approve' } },
}, handler);
```
`rbacPlugin` registers one `onRequest` hook that reads
`request.routeOptions.config.rbac`. A route with no `config.rbac` is let
through unchecked — same fail-open-on-missing-config precedent as v0.6's
`RbacGuard` (opt-in per-route, not a blanket gate; authentication remains
the consumer's own plugin's job).

**Addendum (post-QA correction):** this section originally specified the
plugin as a plain function, deliberately *not* wrapped in `fastify-plugin`,
reasoning that adding a dependency to opt out of Fastify's encapsulation
would be adapter-added behavior beyond "thin translation." QA proved that
reasoning wrong by actually running Fastify's encapsulation model (not
just reading its docs): a plain plugin's `addHook()` only applies within
its own child context, so a route registered as a sibling on the parent
app after `app.register(rbacPlugin, ...)` — the overwhelmingly common
real-world usage shown in this very ADR's own code example — never sees
the hook, silently letting every request through. `fastify-plugin` (`fp()`)
exists precisely to opt a plugin out of encapsulation for this exact
"this hook must apply app-wide" case, and is the standard tool the
Fastify ecosystem itself uses for auth-adjacent plugins (`@fastify/jwt`,
`@fastify/auth`). Corrected: `rbacPlugin` is now `fp(async (fastify,
options) => {...}, { name: 'rbac-fs' })`. `fastify-plugin` is a tiny,
dependency-free utility bundled into `dist/adapters/fastify/index.js` at
build time (devDependency only, not a peerDependency — see §6) rather than
a separate install every consumer needs. Logged in `docs/backlog/
lessons.md`.

### 3. Koa adapter shape — async middleware, Koa's own idiom
```typescript
import { rbacMiddleware } from 'rbac-fs/koa';

router.post('/invoices/:id/approve',
  rbacMiddleware(rbac, 'invoice', 'approve'),
  handler);
```
`rbacMiddleware(rbac, resource, action, options?)` returns
`async (ctx, next) => {...}` — no `next(err)` translation layer needed
(unlike v0.6's Express adapter): Koa's own convention is "throw to
signal an error, `await next()` to continue," which an `async` function
satisfies for free. A thrown error from `rbac.can()` propagates as a real
thrown rejection, satisfying story requirement #3's success metric
directly, with less code than Express's adapter needed (no manual
try/catch-and-forward).

### 4. User-extraction hook — each framework's own convention, matching v0.6/v0.7's established rule
- **Fastify**: `options.getUser(request)`, default `request.user` (the
  common convention `@fastify/jwt`/`@fastify/passport` and hand-rolled
  auth hooks decorate onto the request).
- **Koa**: `options.getUser(ctx)`, default `ctx.state.user` (Koa's own
  documented convention — `ctx.state` is explicitly "the recommended
  namespace for passing information through middleware," per Koa's own
  docs, unlike Express which has no equivalent blessed namespace and
  defaults to bare `req.user`).
Both also accept `options.getContext(...)`, default `{}` — same shape as
v0.6's Express adapter.

### 5. Dependency classification — same rule as v0.6/v0.7
```jsonc
"peerDependencies": {
  ..., "fastify": ">=4", "koa": ">=2"
},
"peerDependenciesMeta": {
  ..., "fastify": {"optional": true}, "koa": {"optional": true}
}
```
Both peer (optional) — both adapters import runtime values from their
respective packages only for **types** (`FastifyRequest`, `Context`), not
runtime values (no adapter calls `import fastify from 'fastify'` — they
only need the shape of a request/context object, exactly like `rbac-fs/
express`'s `RequestHandler` type-only usage in v0.6). Per v0.6's lessons.md
rule ("does any adapter source file import a runtime value, not just a
type"), this means `fastify`/`koa` qualify as **type-only devDependencies**
functionally, but are still declared as optional peerDependencies for
consistency with every other framework adapter in this package and to
correctly signal version compatibility to consumers (a future breaking
Fastify/Koa major could change these types) — matching how `rbac-fs/
express`'s `express` peerDependency already works for the same "types
only, no runtime import" reason.

`fastify-plugin` is different: `rbac-fs/fastify` imports it as a real
runtime value (`fp(...)`, §2's addendum). Per the same v0.6 rule, that
would normally mean peerDependency — but `fastify-plugin` is a tiny,
zero-dependency wrapper utility (not a framework instance a consumer's app
also constructs, unlike `fastify`/`koa`/`express`/`@nestjs/core`
themselves), so bundling its handful of lines directly into `dist/
adapters/fastify/index.js` at build time is both safe (confirmed by a real
build — no unmet-peer bundling failure like v0.6's `@nestjs/core` case,
since `fastify-plugin` itself declares no dependencies of its own) and
better for consumers (one less package to separately install). Kept as a
devDependency only.

### 6. Build/exports
`tsup` build script gains two more entry points
(`src/adapters/fastify/index.ts`, `src/adapters/koa/index.ts`); two more
subpaths in `package.json` `exports` (`./fastify`, `./koa`), same pattern
as every prior subpath.

### 7. Test strategy
- `test/fastify-adapter.test.ts` — real `RBAC` + `LocalJsonAdapter`
  fixture, a real Fastify instance (`fastify()`) with `rbacPlugin`
  registered and real routes declared via `app.inject()` (Fastify's own
  built-in test-request helper, no HTTP server actually bound) — this is
  the "call the real thing" bar this repo holds itself to (v0.6's NestJS
  tests used a real DI container for exactly this reason), not a
  hand-built request/reply fake, because Fastify's own lifecycle (route
  registration → `onRequest` hook → handler) is cheap enough to exercise
  for real via `inject()` and the encapsulation question (§2) is itself
  worth covering against the real framework.
- `test/koa-adapter.test.ts` — real `RBAC` + `LocalJsonAdapter` fixture, a
  minimal structural fake `ctx` (only `state`/`status`/`body`, the fields
  the middleware actually touches) + a real downstream `next` — same
  "fake only the plumbing actually touched" philosophy as v0.6's Express
  tests, appropriate here since Koa's `ctx` object itself has no
  encapsulation/lifecycle subtlety worth testing against the real
  `Application` class (unlike Fastify's route-config plumbing above).

## Consequences
- Hapi/Hono (v1.1) will each need their own per-framework idiom for
  request/config extraction, same as every adapter phase has shown so far
  — no adapter in this package has ever been a copy-paste of another.
- Fastify's `config.rbac` convention is now a public API contract — a
  route author who typos the key (e.g. `config: { rbc: ... }`) gets silent
  fail-open (no permission check), same documented trade-off as v0.6's
  `RbacGuard` missing-metadata behavior. Called out in adapter JSDoc.

## Approval status
**APPROVED — proceeding to tech-lead.**
