# Task: Implement v0.1 Core Engine

status: done
owner: backend-engineer
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.1-core-engine.md"
story: story-v0.1-core-engine.md

## Parallelization plan
None — single backend-engineer instance, sequential. All sub-items touch
shared Core Engine modules per the fan-out rule in CLAUDE.md.

## Sequenced sub-items
1. Scaffold: `package.json`, `tsconfig.json`, `tsup.config.ts`, `.gitignore`
   additions (`dist/`, `node_modules/`).
2. `src/core/types.ts` — interfaces per ADR.
3. `src/core/path-resolver.ts` — sanitization + dataDir priority resolution.
4. `src/core/condition.ts` — equality-only safe evaluator.
5. `src/core/role-resolver.ts` — inheritance walk + cycle detection +
   flatten.
6. `src/adapters/local-json-adapter.ts` — `loadRole`/`loadAllRoles` via
   `fs/promises`; `saveRole`/`deleteRole` throw `NotImplementedYet`;
   `appendLog` no-op.
7. `src/core/rbac.ts` — `RBAC` class: constructor wires PathResolver +
   adapter; `can()`, `listRoles()`.
8. `src/index.ts` — public exports.
9. Build via `tsup`, verify `dist/index.cjs`, `dist/index.mjs`,
   `dist/index.d.ts` all emit.
10. Unit tests (`test/*.test.ts`, `node --test` via `tsx`) — hand off
    acceptance criteria to qa-automation-engineer once green locally, but
    write the first pass yourself per CLAUDE.md ("Write code + own
    unit/integration tests").

## Acceptance criteria
Same as `story-v0.1-core-engine.md` requirements 1–8. Do not implement
`createRole`/`grant`/`revoke`/`deleteRole` (§ out of scope).

## Status log
- 2026-08-10 — task created, approved, handed to backend-engineer.
- 2026-08-10 — implemented: types, identifier.ts, condition.ts,
  role-resolver.ts, rbac.ts, local-json-adapter.ts, index.ts. One ADR
  deviation (path-resolver split core/adapter, see lessons.md) — otherwise
  matches ADR.
- 2026-08-10 — QA: 41 tests green (`npm test`), dist smoke test green
  (CJS require + ESM import against built artifact), grep-verified
  core/index.ts touch zero fs/path. `npm run verify` is the one-command
  gate going forward.
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** No elegance
  concerns; module boundary matches the ADR's intent (corrected during
  implementation, logged in lessons.md). status: done.
