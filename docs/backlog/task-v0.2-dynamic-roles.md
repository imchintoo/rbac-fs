# Task: Implement v0.2 Dynamic Role Management

status: done
owner: backend-engineer
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.2-dynamic-roles.md"
story: story-v0.2-dynamic-roles.md

## Parallelization plan
None — single instance, sequential (same reasoning as task-v0.1).

## Sequenced sub-items
1. `src/core/types.ts` — add `RoleAlreadyExistsError`, `ReservedNameError`,
   `RoleHasDependentsError`, `SchemaValidationError`; add `CreateRoleInput`
   type.
2. `src/core/schema.ts` — hand-rolled validator per ADR.
3. `src/adapters/local-json-adapter.ts` — real `saveRole`/`deleteRole`.
4. `src/core/rbac.ts` — `createRole`/`grant`/`revoke`/`deleteRole`.
5. `src/index.ts` — export new error types + `CreateRoleInput`.
6. Unit + integration tests, run `npm run verify`.

## Status log
- 2026-08-10 — task created, approved, handed to backend-engineer.
- 2026-08-10 — implemented: schema.ts (hand-rolled, no Zod), 4 new error
  types, createRole/grant/revoke/deleteRole on RBAC, real
  saveRole/deleteRole on LocalJsonAdapter.
- 2026-08-10 — QA: found and fixed a real bug (self-referential `inherits`
  misfiring RoleNotFoundError instead of CircularInheritanceError — see
  lessons.md). 72 tests green after fix, `npm run verify` clean, fs/path
  boundary re-verified by grep.
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
