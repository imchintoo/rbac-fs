# Task: Implement v0.3 Audit Logging + Rotation

status: done
owner: backend-engineer
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.3-audit-logging.md"
story: story-v0.3-audit-logging.md

## Parallelization plan
None — single instance, sequential.

## Sequenced sub-items
1. `src/core/types.ts` — add `loadAuditLog?` to `StorageAdapter`, add
   `GetAuditLogOptions`, `RotationOptions`.
2. `src/adapters/local-json-adapter.ts` — size-unit normalizer, filename
   generator, stream cache + `'error'` handler, `appendLog` real impl,
   `loadAuditLog` (read + decompress + parse-skip-malformed + filter +
   sort), maxAge prune on `'rotated'`, `close()`.
3. `src/core/rbac.ts` — wire `can()` to call `appendLog` (awaited,
   swallowed errors), add `getAuditLog()`.
4. `src/index.ts` — export new types.
5. Tests + `npm run verify`.

## Status log
- 2026-08-10 — task created, approved, handed to backend-engineer.
- 2026-08-10 — implemented: rotating-file-stream integration in
  LocalJsonAdapter (first real runtime dependency, adapter-only), hand-rolled
  maxAge pruning, loadAuditLog (active+rotated+gzip, malformed-line-skip),
  can() wired to auto-log allow+deny, getAuditLog() on RBAC.
- 2026-08-10 — QA (real rotation testing, not assumptions): found and fixed
  2 dependency-behavior bugs (history-file glob collision, `.gz` not
  auto-appended for custom generators) + 1 test-design bug (shared fixture
  + auto-logging made an assertion order-dependent). All logged in
  lessons.md. 86 tests green after fixes, `npm run verify` clean.
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
