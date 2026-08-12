---
"rbac-fs": patch
---

Internal code-quality and performance pass, no public API changes:

- Reduced cyclomatic/cognitive complexity of the condition-tree validator,
  leaf evaluator, `createRole`, `validateCreateRoleInput`, and
  `loadAuditLog` by extracting focused helper functions (see
  `docs/backlog/lessons.md`'s 2026-08-12 entry for a refactor bug caught
  and fixed along the way).
- `hasUnconditionalGrant`/`matchingConditions` now use a resource-indexed
  `Map` built once per `resolveRole()` call (and once per `RBACClient`
  construction, since its snapshot is immutable) instead of a linear scan
  — see `bench/hot-paths.mjs` (`npm run bench`) for before/after numbers.
- `LocalJsonAdapter.loadAllRoles`/`loadAuditLog` now read files
  concurrently (`Promise.all`) instead of sequentially.
- Filled in missing JSDoc across the public API surface (core, entry
  points, all nine framework adapters), wired up `jsdoc-scribe` for
  ongoing drift/coverage checks (`npm run docs:check-drift`, now part of
  `npm run verify`) and API-reference generation (`npm run docs:api`).
