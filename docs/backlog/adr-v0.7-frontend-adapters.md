# ADR: v0.7 — React + Vue Adapter Design

status: approved
owner: solutions-architect
created: 2026-08-10
story: story-v0.7-frontend-adapters.md
plan-ref: "docs/PLAN.md §3.1, §7 (RBACClient), §2.1"

## Decision

### 1. Source layout
```
src/adapters/
├── react/index.tsx   → rbac-fs/react
└── vue/index.ts      → rbac-fs/vue
```
Both sit on top of `RBACClient` (`src/client/index.ts`) only — neither
imports from `core/` directly, mirroring v0.6's rule for the backend
adapters. `RBACClient.can()` stays the single source of truth for
permission evaluation on the frontend, same as `RBAC.can()` is for the
backend adapters.

### 2. ui-ux-designer consult — API ergonomics (parallel input, per CLAUDE.md)
Looped in given this story is UI-facing. Findings folded into the design
below:
- Match `docs/PLAN.md`'s literal `<Can I="approve" a="invoice">` naming
  (CASL-style `I`/`a` props) rather than inventing `resource`/`action`
  prop names — consumers coming from CASL (the dominant JS ACL library,
  named explicitly in the README's comparison table per §2) get a
  near-zero-friction migration path, and the story cites this exact
  example.
- `<Can>` must support a `fallback` prop (render *something* on deny, not
  just `null`) — a permission-gated UI without an explicit "how to render
  denial" story leads every consumer to reinvent the same wrapper.
  Default `fallback: null` (render nothing) keeps the zero-config case
  simple; explicit opt-in for anything more.
- `v-can` toggling `display: none` rather than truly unmounting (see §5)
  needs to be documented clearly — a designer/consumer expecting `v-if`
  semantics (full unmount, no residual DOM/state) could be surprised by
  hidden-but-mounted state persisting. Called out in JSDoc + adapter
  README section explicitly, not left implicit.

### 3. React adapter shape
```tsx
import { RbacProvider, Can, usePermission } from 'rbac-fs/react';

<RbacProvider client={client}>
  <Can I="approve" a="invoice" fallback={<span>Not allowed</span>}>
    <ApproveButton />
  </Can>
</RbacProvider>

// imperative form, outside JSX
const can = usePermission();
if (can('invoice', 'approve')) { /* ... */ }
```
`RbacProvider` is a thin React Context provider (`RBAC_CLIENT_CONTEXT`,
default `null`). `usePermission()` reads it and returns
`client.can.bind(client)` directly — no re-implementation, and no memoized
wrapper beyond what `useContext` already gives for free (a new client
reference triggers a normal re-render, same as any other context value).
`usePermission()` throws a clear error if called outside a `RbacProvider`
(fail loud, not a silent no-op that would make every check quietly return
`false`). `<Can>` is built on `usePermission()` internally — it is not a
second code path, just a small render-branch wrapper.

### 4. Vue adapter shape
```ts
import { createRbacPlugin, usePermission } from 'rbac-fs/vue';

app.use(createRbacPlugin(client)); // registers usePermission()'s provide + the v-can directive

// template
<button v-can="{ a: 'invoice', I: 'approve' }">Approve</button>

// composable, outside <template>
const can = usePermission();
if (can('invoice', 'approve')) { /* ... */ }
```
`createRbacPlugin(client)` returns a Vue `Plugin` (`{ install(app) {...} }`)
that does two things on `app.use()`: `app.provide(RBAC_CLIENT_KEY, client)`
(for `usePermission()`, called inside `setup()`) and
`app.directive('can', ...)` (global registration — directives don't have
`setup()`-style `inject()` access, so the directive closes over `client`
directly via the plugin's factory, not via injection). Same `{ a, I }`
object shape as React's props, for consistency across the two adapters
(story requirement isn't literal about this, but a consumer reasonably
using both frameworks across projects benefits from one mental model).

### 5. `v-can` visibility semantics — `v-show`-like, not `v-if`-like — explicit trade-off
`v-can` toggles `el.style.display` (allowed → restore, denied → `'none'`)
rather than inserting/removing the element from the DOM. Reimplementing
`v-if`'s actual behavior (unmount/remount, including child component
lifecycle hooks) inside a directive would mean re-implementing a slice of
Vue's own vnode-patching internals — squarely outside "adapters are thin
translation layers" (§3.1). Documented explicitly (§2 above) so this
isn't a silent surprise. A consumer who needs true unmount-on-deny can
build it themselves with `usePermission()` + `v-if="can('x','y')"`
directly — one line, no adapter needed for that case.

### 6. Dependency classification — same pattern as v0.6
```jsonc
"peerDependencies": {
  "express": ">=4", "@nestjs/common": ">=10", "@nestjs/core": ">=10",
  "react": ">=18", "vue": ">=3"
},
"peerDependenciesMeta": {
  "express": {"optional": true}, "@nestjs/common": {"optional": true}, "@nestjs/core": {"optional": true},
  "react": {"optional": true}, "vue": {"optional": true}
}
```
`react`/`vue` peer (optional) because both adapters `import` runtime
values from them (`createContext`/`useContext` from `react`;
`inject`/`provide` from `vue`) — same rule v0.6's lessons.md entry
established: anything imported as a runtime value, not just referenced for
types, must be a peerDependency so the bundler externalizes it instead of
trying to inline it. `react-test-renderer` (React tests only, no real DOM
needed) goes into devDependencies only — never imported by shipped adapter
code.

### 7. Test strategy
- `test/react-adapter.test.ts` (`.ts`, not `.tsx` — see §8) — real
  `RBACClient`, `react-test-renderer`'s `create()` to actually render
  `<RbacProvider><Can>...</Can></RbacProvider>` trees and read the
  resulting JSON tree, calling `React.createElement` directly instead of
  JSX (avoids widening `tsconfig.test.json`'s `include` to `.tsx` for a
  single file — source still uses real JSX in `.tsx`, see §8). No `can()`
  mock.
- `test/vue-adapter.test.ts` — real `RBACClient`, calls the `v-can`
  directive object's `mounted`/`updated` hooks directly against a minimal
  structural fake element (`{ style: { display: '' } }`, the only DOM
  surface the directive actually touches) — same "fake only the framework
  plumbing actually touched" philosophy as v0.6's NestJS `ExecutionContext`
  fake. No full `@vue/test-utils`/jsdom mount needed since the directive
  never queries the DOM beyond its own `el`.

### 8. Build/tsconfig changes
- `tsconfig.json`: add `"jsx": "react-jsx"` and `"DOM"` to `lib` (type-
  checking only — `@types/react`'s ambient JSX/DOM types need it; does not
  add a runtime DOM dependency anywhere, same non-effect argument as v0.6's
  `experimentalDecorators` flip). `include` extended to `src/**/*.tsx`.
  `tsconfig.test.json` intentionally NOT extended to `**/*.tsx` — every
  test file, including this phase's, stays `.ts` (§7).
- `package.json` `build` script gains two more entry points
  (`src/adapters/react/index.tsx`, `src/adapters/vue/index.ts`); two more
  subpaths in `exports` (`./react`, `./vue`), same `types`/`import`/
  `require` triplet pattern as every prior subpath.

## Consequences
- Angular (v0.9) will need its own DI-token idiom (Angular services/
  `InjectionToken`, closer to NestJS's pattern than React context or a Vue
  plugin) — not a copy-paste of either adapter here, same as v0.6 already
  showed backend adapters needing per-framework idiom for the "override the
  user/context extraction" concern.
- `v-can`'s `display:none` behavior (§5) is now a public API contract, not
  an implementation detail — changing it to true unmount later would be a
  breaking change for any consumer relying on hidden-but-mounted state.

## Approval status
**APPROVED — proceeding to tech-lead.**
