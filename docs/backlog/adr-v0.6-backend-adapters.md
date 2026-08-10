# ADR: v0.6 — NestJS + Express Adapter Design

status: approved
owner: solutions-architect
created: 2026-08-10
story: story-v0.6-backend-adapters.md
plan-ref: "docs/PLAN.md §3.1, §2 (subpath exports), §2.1 (JS/TS + no forced runtime deps), §11.1"

## Decision

### 1. Source layout — matches §2's convention exactly
```
src/adapters/
├── express/index.ts   → rbac-fs/express
└── nestjs/index.ts    → rbac-fs/nestjs
```
Both are pure translation layers over the existing public `RBAC` class
(`src/index.ts`'s Node-wired export, or any `RBAC`-compatible instance the
consumer constructed themselves) — neither adapter imports from `core/`
directly, and neither re-implements `can()`. This mirrors how `client/`
already sits alongside `core/`, `adapters/local-json-adapter.ts` — one more
peer directory, not a new architectural layer.

### 2. Express adapter shape — factory function, not `rbac.middleware()`
`docs/PLAN.md` §3.1's table shows `rbac.middleware('resource', 'action')` as
the illustrative shape. **Deviation, logged here per CLAUDE.md's "product-
owner must resolve or explicitly defer any open decision a story touches"
precedent** (this isn't one of the §12 numbered decisions, but the same
discipline applies to an ADR-level naming choice): a `.middleware()` method
on the `RBAC` class itself would require Core Engine changes to accommodate
an Express-specific concept (`Request`/`Response`/`NextFunction` types),
which directly violates §3.1's central rule — "no adapter re-implements
validation... adapters are thin". Instead:

```typescript
import { rbacMiddleware } from 'rbac-fs/express';

app.get('/invoices/:id/approve',
  rbacMiddleware(rbac, 'invoice', 'approve'),
  handler);

// dynamic resource/action/context via functions, for route-param-dependent checks
app.delete('/invoices/:id',
  rbacMiddleware(rbac, 'invoice', 'delete', {
    getContext: (req) => ({ owner_id: req.params.ownerId }),
  }),
  handler);
```
`rbacMiddleware(rbac, resource, action, options?)` returns a standard
`(req, res, next) => void` Express handler. `rbac` stays a constructor
argument (DI-by-closure) — Express has no DI container, so this is the
idiomatic equivalent of NestJS's injection for this framework. `resource`/
`action` accept either a literal string or `(req) => string`, matching the
story's per-request requirement (#1) without inventing a new mini-DSL.

### 3. NestJS adapter shape — decorator + guard + a provider helper, no `forRoot()` module
```typescript
import { RequirePermission, RbacGuard, RBAC_TOKEN, provideRbac } from 'rbac-fs/nestjs';

@Module({
  controllers: [InvoiceController],
  providers: [provideRbac(new RBAC({ tenantId: 'acme-corp' })), RbacGuard],
})
export class InvoiceModule {}

@Controller('invoices')
@UseGuards(RbacGuard)
export class InvoiceController {
  @RequirePermission('invoice', 'approve')
  @Post(':id/approve')
  approve() { /* ... */ }
}
```
`RequirePermission` is `SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action })`
applied at method or class level. `RbacGuard implements CanActivate`, takes
`Reflector` (Nest-provided) and the injected `RBAC` instance
(`@Inject(RBAC_TOKEN)`) via constructor, reads metadata with
`reflector.getAllAndOverride`, extracts the user (default `req.user`,
overridable — see #4 below), calls `rbac.can(...)`, and either lets the
request through or throws `ForbiddenException`. A route with no
`@RequirePermission()` metadata is allowed through unchecked (fail-open on
*missing* metadata is intentional — this guard is opt-in per-route via the
decorator, not a blanket auth gate; the consumer's own `AuthGuard` remains
responsible for authentication).

`provideRbac(rbac)` is a one-line helper returning
`{ provide: RBAC_TOKEN, useValue: rbac }` — this is the "plain DI provider
helper" the story scopes in instead of a full `RbacModule.forRoot()`
dynamic module (story's "explicitly out of scope" #2). Kept because Nest's
constructor-injection idiom needs *some* token to bind to; this is the
minimal shape that satisfies it without adding module-lifecycle surface
this story doesn't need yet.

### 4. User-extraction hook — same intent, per-framework idiomatic mechanism
Both adapters default to `req.user`, and both let a consumer override how
the user is extracted — but via each framework's own idiom, not a single
shared shape:
- **Express**: `rbacMiddleware`'s `options.getUser(req)` — a plain function,
  since `rbacMiddleware` is already a factory call with an options object.
- **NestJS**: `RbacGuard.getUser(req)`/`RbacGuard.getContext(req)` are
  `protected` methods a consumer subclasses to override (`class
  MyRbacGuard extends RbacGuard { protected getUser(req) { ... } }`, then
  `@UseGuards(MyRbacGuard)`) — the same override-a-protected-method pattern
  Nest's own `AuthGuard('jwt')` uses, not a constructor-options object,
  because `RbacGuard` is DI-constructed by Nest (`reflector`, `RBAC_TOKEN`)
  and DI-constructed classes don't have a caller-supplied-options-object
  call site the way a factory function does. This satisfies requirement #4
  (never assume a specific auth middleware) idiomatically per framework
  rather than forcing one shape onto both.

### 5. Dependency classification — peerDependencies, not dependencies
`package.json` additions:
```jsonc
"peerDependencies": {
  "express": ">=4",
  "@nestjs/common": ">=10",
  "@nestjs/core": ">=10"
},
"peerDependenciesMeta": {
  "express": { "optional": true },
  "@nestjs/common": { "optional": true },
  "@nestjs/core": { "optional": true }
}
```
All three marked optional-peer so `npm install rbac-fs` alone never forces
any framework's install, and installing rbac-fs in a project with none of
them (e.g. a Fastify-only project ahead of v0.8) produces no peer-dep
warning. `@nestjs/core` earns a peerDependency entry alongside
`@nestjs/common` (not just a devDependency) because `RbacGuard` imports
`Reflector` from it at runtime — confirmed necessary, not assumed, by a
real build failure: `tsup`/`esbuild` auto-externalizes packages listed in
`dependencies`/`peerDependencies` but tries to actually bundle anything
only in `devDependencies`, and bundling `@nestjs/core` pulled in its own
optional-peer `require()`s for `@nestjs/microservices`/
`@nestjs/platform-express`/`@nestjs/websockets` (none installed, none
needed by this adapter), which esbuild can't resolve. Logged in
`docs/backlog/lessons.md`. `express`, `@nestjs/testing`, `reflect-metadata`,
`rxjs` stay **devDependencies only** (needed to typecheck/build/test the
adapters and their `.d.ts` output in this repo, but `express` itself is
only ever referenced for its *types* in `rbac-fs/express`, never imported
as a runtime value — the adapter takes an already-constructed `req`/`res`
structurally, see §7) — this is what requirement #5 actually verifies at
build time, not just states as intent.

### 5.1 `tsconfig.json`: `experimentalDecorators`/`emitDecoratorMetadata` — repo-wide flag, adapter-local effect
NestJS's `@Injectable()`/`@Inject()`/parameter decorators require
`experimentalDecorators: true` (+ `emitDecoratorMetadata: true` for
`Reflector`-based DI to resolve constructor param types). These are
compiler flags, necessarily repo-wide in a single `tsconfig.json` — but
their *effect* stays adapter-local: no other source file uses decorator
syntax, so nothing changes for `core/`, `client/`, or the Express adapter's
compiled output. Confirmed by `browser-bundle-smoke.mjs` staying green
unchanged after this flip (§6 below) — the flag enables new syntax, it
doesn't inject a `reflect-metadata` runtime import into files that never
use a decorator.

### 6. Build + exports
`tsup` build command gets two more entry points
(`src/adapters/express/index.ts`, `src/adapters/nestjs/index.ts`); two more
subpaths in `package.json` `exports` (`./express`, `./nestjs`), each with
the same `types`/`import`/`require` triplet as `./client`. No change to the
`.` or `./client` entries or their bundled output — verified by re-running
the existing `browser-bundle-smoke.mjs` unchanged (it only ever bundles
`dist/client/index.js`, so a passing run after this change proves nothing
NestJS/Express-shaped leaked into the isomorphic build).

### 7. Test strategy (answers story requirement #6 concretely)
- `test/express-adapter.test.ts` — real `RBAC` + `LocalJsonAdapter` against
  a temp `.rbac/` fixture, real fake Express-shaped `req`/`res`/`next`
  objects (Express itself isn't needed at runtime for a unit test — a
  minimal object literal satisfying the `Request`/`Response` surface the
  middleware actually touches is enough, and keeps the test fast/isolated,
  same philosophy as `rbac.test.ts`'s in-memory adapters for Core Engine
  tests). No `can()` mock.
- `test/nestjs-adapter.test.ts` — real `RBAC` + `LocalJsonAdapter`, real
  `Reflector` from `@nestjs/core`, a minimal real `ExecutionContext`-shaped
  object (Nest's `Test.createTestingModule` is heavier than needed for a
  guard-only unit test and pulls in more of the framework than this ADR's
  "thin adapter" scope justifies testing against — a hand-built
  `ExecutionContext` covering `switchToHttp().getRequest()` is what
  `RbacGuard` actually calls, and is the same "call the real thing, fake
  only the framework plumbing it insists on" approach already used
  elsewhere in this repo, e.g. `dist-smoke.mjs` against the real build
  instead of mocking `fs`).

## Consequences
- Adding Fastify/Koa (v0.8) or Hapi/Hono (v1.1) later is purely additive —
  new `src/adapters/<name>/` dirs, new subpath exports, new peer deps — no
  change to `core/`, `client/`, or the adapters shipped in this phase.
  Confirms §9's "why adapters are safe to add later" claim empirically, not
  just by assertion.
- `RbacGuard`'s fail-open-on-missing-metadata behavior must be called out
  clearly in adapter README/JSDoc — a consumer who forgets
  `@RequirePermission()` on a route gets no permission check at all, by
  design (opt-in per-route), which is a footgun if undocumented.

## Approval status
**APPROVED — proceeding to tech-lead.**
