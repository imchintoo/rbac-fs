# Task: Implement v0.4 RBACClient + Browser Build

status: done
owner: backend-engineer
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.4-browser-client.md"
story: story-v0.4-browser-client.md

## Sequenced sub-items
1. `src/core/types.ts` — add `RBACClientSnapshot` type.
2. `src/client/index.ts` — `RBACClient` class, reusing `role-resolver.ts`/`condition.ts`.
3. `package.json` — `./client` exports entry, `esbuild` devDependency, second `build` step for the client entry.
4. Grep-verify `src/client/` touches no `fs`/`path`/`rotating-file-stream`.
5. Tests: RBACClient behavior + esbuild bundle smoke test.

## Status log
- 2026-08-10 — task created, approved, handed to backend-engineer.
- 2026-08-10 — implemented: `src/client/index.ts` (RBACClient, reuses
  role-resolver.ts/condition.ts directly — zero duplicated logic), dual
  tsup entry build, `./client` exports, esbuild devDependency.
- 2026-08-10 — QA: 7 new RBACClient unit tests (including a parity check
  proving RBACClient and RBAC.can() agree on identical permission data),
  dist smoke extended to cover the client subpath, new
  browser-bundle-smoke.mjs (esbuild) confirms zero fs/path/rotating-file-
  stream leakage in the actual browser bundle. 93/93 tests green, no bugs
  found this round (clean pass, no new lessons.md entry needed).
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
