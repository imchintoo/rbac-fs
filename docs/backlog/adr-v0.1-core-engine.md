# ADR: v0.1 Core Engine — Module Structure & Resolution Algorithm

status: approved
owner: solutions-architect
created: 2026-08-10
plan-ref: "docs/PLAN.md §3 (architecture), §3.1 (StorageAdapter), §4 (.rbac/ layout), §8 (guardrails #1, #4)"

## Context
v0.1 must ship the isomorphic Core Engine + one `StorageAdapter`
implementation (`LocalJsonAdapter`), with zero runtime dependencies, and a
build that produces working CJS+ESM+`.d.ts` from TypeScript source. Nothing
here may assume Node-only APIs inside the Core Engine — only
`LocalJsonAdapter` is allowed to touch `fs`.

## Decision

### Module layout
```
src/
  core/
    types.ts            — RoleDefinition, Permission, Condition, AuditEntry,
                           StorageAdapter, RBACOptions, RbacError
    condition.ts         — safe equality-only expression evaluator
    role-resolver.ts      — inherits-chain walk + cycle detection + flatten
    path-resolver.ts      — sanitization + dataDir resolution priority (§4)
    rbac.ts                — RBAC class (can, listRoles) — depends only on
                             StorageAdapter, never on fs directly
  adapters/
    local-json-adapter.ts — implements StorageAdapter via fs/promises
  index.ts                 — public exports: RBAC, LocalJsonAdapter, types
```
This keeps the §3 layer boundary real, not just documented: `core/rbac.ts`
imports only `types.ts`/`role-resolver.ts`/`condition.ts` — no `fs`, no
`path` beyond what a caller injects via the adapter. `LocalJsonAdapter` is
the only file allowed to `import('fs/promises')` or `import('path')`. This
is checkable by grep, so QA/tech-lead can verify it, not just take it on
faith.

### `StorageAdapter` (matches docs/PLAN.md §3.1 verbatim)
v0.1 implements `loadRole`/`loadAllRoles` on `LocalJsonAdapter`.
`saveRole`/`deleteRole`/`appendLog`/`watch` exist on the interface (so v0.2
`createRole`/v0.3 audit logging/v0.5 watch don't require an interface
change) but `LocalJsonAdapter`'s v0.1 implementation of
`saveRole`/`deleteRole` throws `NotImplementedYet` and `appendLog` is a
no-op — explicit, not silently missing, so nothing calling them
accidentally believes it worked.

### PathResolver — dataDir priority (§4)
1. `options.dataDir` (explicit)
2. `process.env.RBAC_DATA_DIR`
3. Walk up from `process.cwd()` looking for the nearest `package.json`,
   use `<that dir>/.rbac`
4. Fallback: `process.cwd()/.rbac`

Resolved once per `RBAC` instance (constructor), not per-call — avoids
inconsistent behavior if `cwd()` changes mid-process.

**Sanitization (§8 guardrail #1):** `tenantId` and `roleName` validated
against `^[a-zA-Z0-9_-]+$` in `path-resolver.ts` (single choke point) before
any join happens — `LocalJsonAdapter` calls this, never constructs a role
path itself. Rejects `null`/`undefined`/empty string distinctly from an
invalid-pattern tenantId (empty → `_shared`, per §4 "tenantId optional").

### Role resolution algorithm (`role-resolver.ts`)
- Input: target role name + a `loadRole(name)` accessor (bound to the
  adapter/tenant by the caller).
- DFS walk of `inherits`, tracking a `visiting: Set<string>` — if a name is
  re-encountered while still `visiting`, throw `CircularInheritanceError`
  with the full cycle path in the message (debuggability for a hand-edited
  JSON file).
- Flatten: merge `permissions` arrays from the chain (child overrides are
  additive in v0.1 — no "revoke via inheritance" semantics yet, that's a
  v0.2 concern once `revoke()` exists).
- Result is memoized per `can()` call, not cached across calls in v0.1 (no
  invalidation mechanism exists yet — that's v0.5's file watcher). Document
  this explicitly so nobody assumes live-reload before v0.5.

### Condition evaluator (`condition.ts`)
Scope strictly to the §7 example shape: `"<dotted.path> == <dotted.path or
literal>"`. No `eval()`, no `Function()` constructor — hand-rolled tokenizer
for `==` only. Reject any `when` string that doesn't match
`^[\w.]+\s*==\s*[\w."']+$` at role-load time (fail fast, not at
evaluation time). This directly answers engineering-manager's risk flag in
`sprint-1-scope.md`.

### Build tooling
`tsup`, chosen for zero-config dual CJS+ESM+dts output from a single entry
point — matches §11's "tsup or a custom Rollup config" suggestion, tsup is
simpler and sufficient for a single `"."` export in v0.1 (no per-adapter
subpath complexity yet). `package.json` `exports` map scoped to only what
v0.1 actually ships:
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  }
}
```
Deliberately NOT adding `browser`/`node` condition splits yet — that's v0.4
(browser build phase, §9). Adding unused conditions now would document
capabilities that don't exist, which is worse than adding them later when
they're real.

### Testing approach
Node's built-in `node:test` + `node:assert` (available `>=20`, decided in
`story-v0.1-core-engine.md`) run against TypeScript directly via `tsx`
(devDependency only) — zero test-framework runtime dependency, consistent
with the "zero dependencies in the core engine" goal extending to keeping
the dev toolchain light.

## Consequences
- `createRole`/`grant`/`revoke`/`deleteRole` are absent from `RBAC` in v0.1
  (not stubbed as public methods) — v0.2 adds them as new methods, which is
  additive and non-breaking.
- Because `LocalJsonAdapter` is the only fs-touching file, swapping in a
  future `PostgresAdapter` (§9, v1.x) only requires implementing
  `StorageAdapter` — `rbac.ts` doesn't change.

## Verdict
**APPROVED — proceeding to tech-lead.**
