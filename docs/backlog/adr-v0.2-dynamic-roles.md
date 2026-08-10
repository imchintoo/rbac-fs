# ADR: v0.2 — Dynamic Role Management

status: approved
owner: solutions-architect
created: 2026-08-10
plan-ref: "docs/PLAN.md §7, §8; docs/backlog/story-v0.2-dynamic-roles.md"

## Context
Need `createRole`/`grant`/`revoke`/`deleteRole` on `RBAC`, with §8's
guardrails, without violating the zero-runtime-dependency goal.

## Decision

### `src/core/schema.ts` — hand-rolled validator (no Zod)
A minimal, purpose-built validator beats a general schema library here:
the shape is small and fixed (role definitions have five known fields), and
pulling in Zod would add a runtime dependency to the one part of the
package (§1, §2.1) that explicitly promises not to have any. Functions:
- `validateCreateRoleInput(input): void` — allow-list check (`label`,
  `inherits`, `permissions`, `conditions` only; anything else throws
  `SchemaValidationError`), then per-field type/shape checks.
- `validatePermission(p): void` — `resource` non-empty string,
  `actions` non-empty array of non-empty strings.
- Conditions reuse `condition.ts`'s existing `validateCondition(when)` —
  already hand-rolled, already zero-dependency, no need for a second
  implementation.

### Reserved names
`RESERVED_ROLE_NAMES = ['admin', 'system-admin']` (§8 example names — not
config-driven in v0.2, no story requirement to make it configurable yet).
Checked in `createRole` and `deleteRole` only — `grant`/`revoke` mutate an
existing role's permissions, not its identity, so the "overwrite protection"
guardrail's literal scope doesn't extend to them. (Scoping decision, stated
so it isn't mistaken for an oversight.)

### Cycle check — reuse `role-resolver.ts`, don't duplicate
`grant`/`revoke` can't introduce a cycle (their input shape has no
`inherits` field) — the guardrail is satisfied by construction for those
two, not by a redundant check. `createRole` is the only mutator that can:
validate `inherits` parents exist, then call the *existing*
`resolveRole()` with a `loadRole` wrapper that returns the hypothetical new
role definition for `name` and defers to the real adapter for everything
else. If `resolveRole` throws `CircularInheritanceError`, propagate it
before writing anything to disk. This is the same reason v0.1 built
`role-resolver.ts` to take an injectable `loadRole` — this is exactly the
seam it was for.

### Dependents check on `deleteRole`
Not in §8's literal list — added because §8's spirit ("build guardrails
into core, not left to consumers") argues for catching this at the
cheap/obvious point (delete time) rather than the expensive/confusing one
(some later `can()` call throwing `RoleNotFoundError` for a role that used
to exist). Implementation: `loadAllRoles(tenantId)`, filter for any role
whose `inherits` includes the target, block unless `force`. O(n) roles per
delete — fine at the scale this package targets (roles are dozens, not
millions, per tenant).

### `LocalJsonAdapter.saveRole`/`deleteRole`
- `saveRole`: `mkdir(rolesDir, { recursive: true })` then
  `writeFile(path, JSON.stringify(role, null, 2))` — 2-space indent because
  these files are meant to be git-diffed and hand-read (§1 goal).
  `meta.createdAt`/`updatedAt` stamped by `RBAC.createRole`, not the
  adapter — keeps the adapter a dumb I/O layer, timestamp policy lives in
  Core Engine where it can be unit-tested without fs.
- `deleteRole`: `unlink(path)`; `ENOENT` → treat as already-deleted
  (idempotent), don't throw.

## Consequences
- `RoleAlreadyExistsError`, `ReservedNameError`, `RoleHasDependentsError`,
  `SchemaValidationError` are new error types (types.ts) — all extend
  `RbacError` per v0.1's pattern, so a consumer can catch-all on
  `RbacError` or discriminate by `.code`.
- No change to `StorageAdapter`'s shape — v0.1 already declared
  `saveRole`/`deleteRole` on the interface for exactly this reason.

## Verdict
**APPROVED — proceeding to tech-lead.**
