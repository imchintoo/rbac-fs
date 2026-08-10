# ADR: v0.9 — Angular + Svelte Adapter Design

status: approved
owner: solutions-architect
created: 2026-08-10
story: story-v0.9-frontend-adapters-batch2.md
plan-ref: "docs/PLAN.md §3.1, docs/backlog/adr-v0.7-frontend-adapters.md (established pattern this phase extends)"

## Decision

### 1. Source layout
```
src/adapters/
├── angular/index.ts   → rbac-fs/angular
└── svelte/index.ts    → rbac-fs/svelte
```
Both sit on top of `RBACClient` only, same rule as v0.7.

### 2. Angular adapter shape — `RbacService` (DI) + `*rbacCan` structural directive
```typescript
import { provideRbacClient, RbacCanDirective } from 'rbac-fs/angular';

bootstrapApplication(AppComponent, {
  providers: [provideRbacClient(client)],
});

// template
<button *rbacCan="'invoice'; action: 'approve'">Approve</button>
```
`RbacService` is a plain `@Injectable()` wrapping one injected `RBACClient`
(bound via `RBAC_CLIENT` `InjectionToken` + `provideRbacClient(client)` —
same one-line-provider-helper pattern as v0.6's NestJS `provideRbac()` and
v0.7's Vue `createRbacPlugin()`, adapted to Angular's own DI idiom rather
than a module/plugin). `*rbacCan` uses Angular's structural-directive
microsyntax exactly like `*ngIf`: `rbacCan` (main binding → resource),
`rbacCanAction` (the `action:` key → action), optional `rbacCanContext`.
Implemented with the same `TemplateRef`/`ViewContainerRef.createEmbeddedView`/
`.clear()` pair every structural directive (including Angular's own
`*ngIf`) uses — **this is genuinely true unmount/remount**, not the
`display:none` compromise v0.7's Vue `v-can` had to make, because
`ViewContainerRef` is the framework's own public API for exactly this,
not an internal reimplemented in an adapter.

### 3. Svelte adapter shape — factory functions, not context/inject
`docs/PLAN.md` §3.1 says "a Svelte store (`$permissions`) + a `can()`
action." Both are built as **factory functions closing over an explicit
client** (`createPermissionStore(client)`, `createCanAction(client)`)
rather than Svelte's `setContext`/`getContext`, matching Vue's
`makeCanDirective(client)` precedent from v0.7 — not Svelte's own
`inject`-equivalent. Reasoning: `getContext()` is only guaranteed to
resolve correctly during a component's synchronous `<script>`
initialization; whether it's reliably readable from inside a `use:`
action's callback (which Svelte invokes during DOM mount/patch, not
necessarily within that same window) is a real subtlety this ADR isn't
confident enough about to build on without dedicated verification the
story doesn't scope time for — an explicit-client factory sidesteps the
question entirely and is no more verbose for the common case (call the
factory once per app, reuse the returned store/action everywhere).
```typescript
import { createPermissionStore, createCanAction } from 'rbac-fs/svelte';

const permissions = createPermissionStore(client); // $permissions is the bound can() function
const can = createCanAction(client);
```
```svelte
{#if $permissions('invoice', 'approve')}<button>Approve</button>{/if}

<button use:can={{ a: 'invoice', I: 'approve' }}>Approve</button>
```
`createPermissionStore` returns a Svelte store-contract object
(`{ subscribe(run) => unsubscribe }`) whose value is `client.can` itself
(bound), not a permission array — calling the value directly in a
template (`$permissions('invoice','approve')`) reads naturally and
mirrors React/Vue's `usePermission()` exactly, just delivered through
Svelte's `$`-auto-subscription sugar instead of a hook/composable call.
Satisfies the Svelte store contract's "call `run` synchronously on
subscribe" requirement; since `RBACClient` is an immutable snapshot (v0.4
design, no live-reload for the browser client), the value never changes
post-creation, so `unsubscribe` is a no-op — consistent with story
requirement #4 (no second source of truth, no adapter-invented async
permission model).

`createCanAction(client)` returns the actual Svelte action function
(`(node, params) => ActionReturn`), matching Vue's directive-factory
shape. Like `v-can`, toggles `style.display` — real DOM
unmount/remount would mean reimplementing Svelte's own `{#if}` compiler
output inside an action, which (unlike Angular's `ViewContainerRef` case)
actions genuinely have no public API for — same documented trade-off as
v0.7's `v-can`, called out in JSDoc.

### 4. Dependency classification
```jsonc
"peerDependencies": {
  ..., "@angular/core": ">=16", "svelte": ">=4"
},
"peerDependenciesMeta": {
  ..., "@angular/core": {"optional": true}, "svelte": {"optional": true}
}
```
`@angular/core` is a **real runtime import** (`Directive`/`Injectable`/
`Input` decorators execute at class-definition time, not just types;
`TemplateRef`/`ViewContainerRef` are real injected values) — per v0.6's
lessons.md rule this must be externalized (peerDependency), not bundled:
Angular is a singleton-instance framework, so bundling a second copy of
`@angular/core` into `rbac-fs/angular`'s dist would risk two Angular
instances fighting over DI/change-detection, a materially worse failure
mode than v0.6's `@nestjs/core` bundling issue (that one just failed the
build; this one would fail silently at runtime if it ever did bundle).
`svelte` is referenced only for the `Action`/`ActionReturn` **types**
(`svelte/action`) — no runtime import — declared as an optional peer
anyway for the same "correctly signal version-compatibility intent"
reasoning `rbac-fs/express`'s `express` peer already established in v0.6,
even though, like that case, it could technically be devDependency-only
without breaking anything.

### 5. Build/exports
Two more `tsup` entry points (`src/adapters/angular/index.ts`,
`src/adapters/svelte/index.ts`); two more `package.json` `exports`
subpaths (`./angular`, `./svelte`), same triplet pattern as every prior
subpath.

### 6. Test strategy — fakes only the framework plumbing actually touched, same bar as every prior adapter
- `test/angular-adapter.test.ts` — real `RBACClient`, `RbacService`
  instantiated directly (`new RbacService(client)` — no Angular DI
  container needed, same reasoning as v0.6's `new RbacGuard(...)` tests),
  `RbacCanDirective` instantiated directly with a **minimal structural
  fake** `ViewContainerRef` (`{ createEmbeddedView: spy, clear: spy }`, the
  only two methods the directive calls) and an opaque fake `TemplateRef`
  (`{}` — the directive never inspects it, only passes it through to
  `createEmbeddedView`). Deliberately **not** using Angular's `TestBed` /
  `@angular/compiler` / `@angular/platform-browser` / `zone.js` — those
  would require a DOM (jsdom) this repo has avoided everywhere else (v0.7
  didn't need jsdom for React/Vue either) and would pull in a
  disproportionately heavy toolchain for a directive whose entire logic is
  two method calls behind an `if`. `@angular/core` alone (no compiler, no
  platform packages) is sufficient to typecheck and construct real
  `Directive`/`Injectable`-decorated classes without ever bootstrapping an
  Angular application.
- `test/svelte-adapter.test.ts` — real `RBACClient`, `createPermissionStore`
  and `createCanAction`'s returned functions called directly against a
  minimal structural fake element (`{ style: { display: '' } }`), same
  pattern as v0.7's Vue directive tests. No Svelte compiler, no
  `@testing-library/svelte`, no `.svelte` component files needed — the
  action/store are plain functions, testable as such.

## Consequences
- No frontend framework beyond React/Vue/Angular/Svelte is named in
  `docs/PLAN.md` §3.1's table — v0.9 completes that table. Any future
  frontend adapter (e.g. SolidJS, community-requested) would need its own
  ADR establishing which of this package's precedents (hook-style
  context/provider like React/Vue, or explicit-client-factory like Svelte)
  fits that framework's idioms, following the same "verify the framework's
  actual context/DI timing guarantees before choosing" discipline §3
  applied here.
- The Svelte context-timing question (§3) was deliberately *avoided*
  rather than *resolved* — if a future story wants `getContext`-based
  ergonomics for Svelte (matching React/Vue's provider pattern more
  closely), it needs a dedicated spike verifying `getContext()`'s
  behavior inside `use:` actions against a real compiled Svelte component,
  not an assumption either way.

## Approval status
**APPROVED — proceeding to tech-lead.**
