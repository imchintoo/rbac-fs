# Story: v0.1 — Core Engine + LocalJsonAdapter

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-1
plan-ref: "docs/PLAN.md §9 (v0.1 row), §3 (architecture), §4 (.rbac/ layout), §7 (public API, read-path only)"

## Open decisions — resolved (docs/PLAN.md §12)

1. **`_shared/` role inheritance:** fully separate namespaces in v1. Tenant
   roles CANNOT inherit `_shared/` roles by default — isolation-first,
   avoids accidental cross-tenant privilege leakage. Revisit as an explicit
   opt-in (namespaced `inherits: ["_shared:role"]` syntax) post-v1 if real
   demand shows up. Default, not a permanent ban.
2. **Tenant provisioning:** both. `rbac.createTenant(tenantId)` is exposed
   as an explicit convenience (creates the folder skeleton), AND the package
   lazily discovers any tenant folder that already exists under
   `.rbac/tenants/` — a consuming app is never forced to call
   `createTenant()` if it just wants to drop a folder in via its own
   provisioning flow.
3. **Minimum Node version:** `>=20`. Node 18 is past EOL (April 2025); Node
   20 itself reached EOL April 30, 2026 but remains widely deployed, so it's
   the floor rather than the recommendation — README will recommend 22+ for
   production. `>=20` also means `node:test` is available for zero-dependency
   testing (relevant to the QA ticket) and `fs.promises` needs no polyfill.
   ([nodejs.org/en/about/eol](https://nodejs.org/en/about/eol))

## Problem statement
No code exists yet. Before any framework adapter or dynamic role-management
work can start, the package needs a working, isomorphic core: load role
files, resolve inheritance, evaluate `can()`, all through a `StorageAdapter`
so the filesystem is swappable later without touching the public API.

## Requirements (acceptance criteria)
1. `RBAC` class instantiable as `new RBAC({ tenantId?, dataDir? })`; resolves
   `dataDir` per priority order in §4 (explicit → `RBAC_DATA_DIR` env →
   nearest `package.json` → `cwd()/.rbac`).
2. `rbac.can(user, resource, action, context?)` — loads the user's role,
   resolves its `inherits` chain, flattens permissions, evaluates any
   `conditions` (`==` comparisons against `context`/`user` only, per §7
   example — richer expressions are out of scope for v0.1), returns
   `Promise<boolean>`.
3. `rbac.listRoles()` — returns all role definitions for the current tenant
   (or `_shared` if no tenant).
4. `LocalJsonAdapter` implements `StorageAdapter` (§3) for `loadRole` /
   `loadAllRoles` — `saveRole`/`deleteRole`/`appendLog` are part of the
   interface (so v0.2/v0.3 don't require an interface change) but are not
   exercised by any public v0.1 API surface (`createRole`/`grant`/etc. are
   explicitly v0.2 scope per roadmap — do not implement them early).
5. `tenantId`/`roleName` sanitized against `^[a-zA-Z0-9_-]+$` before any
   `path.join()` (§8 guardrail #1) — this is a correctness requirement now,
   not deferred to v0.2, since `LocalJsonAdapter` touches the filesystem
   starting in v0.1.
6. Circular-inheritance is detected and rejected (as an error, not a crash)
   while resolving `inherits` during `can()` — role files are hand-editable,
   so a bad edit must fail loudly, not stack-overflow.
7. TypeScript source, dual CJS+ESM build with a matching `.d.ts`, zero
   runtime dependencies in the core engine (§1 goal, §2.1).
8. `require('rbac-fs')` (CJS) and `import { RBAC } from 'rbac-fs'` (ESM) both
   work against the built `dist/` without a TS toolchain in the consuming
   project.

## Explicitly out of scope for this story
- `createRole` / `grant` / `revoke` / `deleteRole` (v0.2)
- Audit logging / rotation (v0.3)
- Browser build / `RBACClient` (v0.4)
- Any framework adapter, CI matrix, or publish setup

## Success metrics
- QA can construct a temp `.rbac/` fixture, call `can()` against nested
  inheritance, and get correct allow/deny — with test output shown, not
  claimed.
- Path-traversal attempt via a malicious `tenantId` (`../../etc`) is
  rejected before touching disk.
- A hand-crafted circular `inherits` fixture fails with a clear error
  instead of hanging/crashing the process.

## Approval status
**APPROVED — proceeding to engineering-manager.**
