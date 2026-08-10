# Story: v0.2 — Dynamic Role Management + Validation Guardrails

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-2
plan-ref: "docs/PLAN.md §9 (v0.2 row), §7 (public API), §8 (guardrails #2–#4)"

## Problem statement
v0.1 is read-only — roles must be hand-authored on disk. v0.2 delivers the
"can users create roles?" answer from §1's goals: `createRole`/`grant`/
`revoke`/`deleteRole`, safe enough to expose without a consuming app
accidentally corrupting its role graph.

## Requirements (acceptance criteria)
1. `rbac.createRole(name, { label?, inherits?, permissions?, conditions? }, options?)`
   — validates identifier + input shape, rejects unknown fields, rejects if
   `name` is a reserved name (`admin`, `system-admin`) unless
   `options.force`, rejects if the role already exists unless
   `options.force`, rejects if any `inherits` parent doesn't exist, rejects
   if the resulting graph would cycle (§8 guardrail #4).
2. `rbac.grant(roleName, { resource, actions })` — role must already exist;
   merges the grant into `permissions` (dedupes actions per resource, not
   duplicate entries).
3. `rbac.revoke(roleName, { resource, actions })` — role must already
   exist; removes only the listed actions; idempotent (revoking something
   not granted is not an error); an emptied entry is removed, not left as
   `actions: []`.
4. `rbac.deleteRole(name, options?)` — reserved-name guard same as create;
   refuses to delete a role that other roles currently `inherits` from
   unless `options.force` (not in the original §8 list verbatim, but
   product-owner is approving it as an extension of guardrail intent —
   prevents orphaned `inherits` references that would otherwise only
   surface as a `RoleNotFoundError` later, at `can()` time, far from the
   mistake).
5. Schema validation (§8 guardrail #2) implemented **without adding a
   runtime dependency** — `docs/PLAN.md` §1/§2.1 commit to "zero
   dependencies in the core engine"; PLAN §8 says "Zod or equivalent" and
   product-owner is reading "equivalent" as license to hand-roll this
   rather than take on a dependency that contradicts a goal stated
   elsewhere in the same spec. Flagging this reconciliation explicitly so
   it's a recorded decision, not solutions-architect quietly picking a side.
6. `LocalJsonAdapter.saveRole`/`deleteRole` (stubbed `NotImplementedYetError`
   in v0.1) get real implementations.

## Explicitly out of scope
- Audit logging of these mutations (v0.3 — `appendLog` stays a no-op).
- Any HTTP/framework-level authorization of *who* can call these methods
  (§8 guardrail #5 — that's the consuming app's job per the spec, document
  it, don't build it).

## Success metrics
- QA shows: reserved-name rejection, cycle rejection on `createRole`,
  schema-validation rejection (unknown field, empty actions array, bad
  condition grammar), dependents-block on `deleteRole`, and that
  `revoke()` of a never-granted permission doesn't throw.

## Approval status
**APPROVED — proceeding to engineering-manager.**
