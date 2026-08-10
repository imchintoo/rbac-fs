# ADR: v0.4 — RBACClient + Browser Build

status: approved
owner: solutions-architect
created: 2026-08-10
plan-ref: "docs/PLAN.md §7, §9, §10; docs/backlog/story-v0.4-browser-client.md"

## Decision

### `src/client/index.ts` — new entry, reuses Core Engine, zero new logic
```
src/client/index.ts
  RBACClient class
  RBACClientSnapshot type
```
`RBACClient` is a thin wrapper over the *same* `hasUnconditionalGrant`,
`matchingConditions`, `evaluateCondition` functions `RBAC.can()` already
uses from `role-resolver.ts`/`condition.ts` — no re-implementation, direct
proof that the "single source of truth" rule from `adr-v0.1-core-engine.md`
holds up now that there are two consumers of the permission-evaluation
logic. This file imports only from `src/core/*` — same isomorphic
guarantee as everything else in `core/`, verified by the same grep pattern
extended to also check `src/client/`.

### Snapshot shape
```ts
interface RBACClientSnapshot {
  /** Optional — needed only if a condition's `when` references `user.*`. */
  user?: Partial<RbacUser>;
  permissions: Permission[];
  conditions?: Condition[];
}
```
Deliberately NOT the full `RoleDefinition` (no `name`/`inherits`/`meta`) —
per §7, the snapshot is already-resolved output from whatever backend
endpoint the consuming app builds; `RBACClient` has no business knowing
about role names or inheritance, only the flattened result. `user` is
optional: a snapshot with no conditions referencing `user.*` doesn't need
it, and `RBACClient` shouldn't force every consumer to embed user data it
may not want to expose to the browser.

### `can()` is genuinely synchronous
```ts
can(resource: string, action: string, context: Record<string, unknown> = {}): boolean
```
No `Promise`, matching §7's example exactly (`client.can('invoice',
'approve')`, no `await`). This is possible only because the snapshot is
already in memory — no adapter call, nothing async in the isomorphic
evaluator functions being reused.

### `exports` map addition
```json
"./client": {
  "types": "./dist/client/index.d.ts",
  "import": "./dist/client/index.js",
  "require": "./dist/client/index.cjs"
}
```
Built via a second `tsup` entry point (`src/client/index.ts`), same
CLI-flags approach as the main build (no config file — see the
`bundle-require`/EPERM lesson from v0.1). The main `.` export is
**unchanged** — story's scoping decision, not revisited here.

### Bundle-level smoke test — esbuild, not Vite/Webpack
§10 says "bundle with Vite/Webpack" as the verification method. Using
`esbuild` instead: it's already a transitive dependency of `tsup` (so
adding it as a direct devDependency doesn't grow the true dependency tree,
just pins a version explicitly), it's a real bundler doing real
tree-shaking/resolution — same category of tool, satisfies the actual
intent (verify nothing Node-only leaks into a browser bundle) without
pulling in a full Vite or Webpack toolchain for a single smoke check. Same
pattern as the Zod-vs-hand-rolled decision in `adr-v0.2-dynamic-roles.md`:
read "the spirit of the requirement," not the literal tool name, when the
literal tool would be disproportionate to what's being verified.

Test: `esbuild.build({ entryPoints: ['dist/client/index.js'], bundle: true,
platform: 'browser', write: false })`, then assert the output text contains
none of `fs`/`path`/`rotating-file-stream`/`node:` references. Bundling the
already-built `dist/client/index.js` (not `src/`) is what actually matters —
it's what a real consumer's bundler would resolve.

## Consequences
- `RBACClient` and `RBAC` now both depend on `role-resolver.ts`'s exported
  helper functions being part of the Core Engine's public-ish internal
  surface (already exported from `core/role-resolver.ts`, just not
  re-exported from the package's public `.`/`./client` entries) — no
  interface change needed, they were already isomorphic and exported at
  the module level.
- A future `rbac-fs/react` etc. (v0.7+) will sit on top of `RBACClient`,
  per §3.1's adapter-thinness rule — this ADR's `RBACClient` is the
  foundation those adapters assume exists.

## Verdict
**APPROVED — proceeding to tech-lead.**
