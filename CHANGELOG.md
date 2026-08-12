# Changelog

## 1.0.2

### Patch Changes

- 1cd46ab: Internal code-quality and performance pass, no public API changes:
  
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

All notable changes to this project are documented in this file. Format
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every
version below is purely additive — see `docs/PLAN.md` §9's "why adapters
are safe to add later" for why no `Changed`/`Removed` sections were
needed at any point through v0.9.

## [Unreleased]
### Added
- Release readiness: README, this changelog, CI workflow (JS/TS
  consumer-mode fixtures), trusted-publishing workflow config,
  `publishConfig.provenance`.

## [0.9.0] - 2026-08-10
### Added
- `rbac-fs/angular`: `RbacService`, `provideRbacClient()`, `*rbacCan`
  structural directive (real `ViewContainerRef` unmount/remount).
- `rbac-fs/svelte`: `createPermissionStore()`, `createCanAction()`.

## [0.8.0] - 2026-08-10
### Added
- `rbac-fs/fastify`: `rbacPlugin` (`onRequest` hook + route
  `config.rbac`), wrapped in `fastify-plugin` for app-wide coverage.
- `rbac-fs/koa`: `rbacMiddleware`, async/await native.

## [0.7.0] - 2026-08-10
### Added
- `rbac-fs/react`: `RbacProvider`, `<Can I="..." a="...">`,
  `usePermission()`.
- `rbac-fs/vue`: `createRbacPlugin()`, `v-can` directive,
  `usePermission()` composable.

## [0.6.0] - 2026-08-10
### Added
- `rbac-fs/express`: `rbacMiddleware(rbac, resource, action, options?)`.
- `rbac-fs/nestjs`: `@RequirePermission()`, `RbacGuard`, `provideRbac()`.

## [0.5.0] - 2026-08-10
### Added
- In-memory role cache in `LocalJsonAdapter`, invalidated synchronously on
  own writes and asynchronously via a `chokidar` watcher on hand-edits
  (live-reload).
- `StorageAdapter.watch()` implemented; `cache: false` escape hatch.
- `RBAC.close()` / `StorageAdapter.close()` for graceful shutdown of
  watchers and log streams.

## [0.4.0] - 2026-08-10
### Added
- `rbac-fs/client`: `RBACClient`, synchronous read-only `can()` against an
  already-resolved permission snapshot — no filesystem access, safe for
  browser bundles.
- Dual `exports` map (`.` / `./client`) with independent CJS+ESM+`.d.ts`
  builds.

## [0.3.0] - 2026-08-10
### Added
- JSONL audit logging (`logs/<role>.jsonl`) — every `can()` call recorded
  with allow/deny outcome.
- Log rotation via `rotating-file-stream` (size + count) plus a
  hand-rolled `maxAge` retention sweep.
- `RBAC.getAuditLog(roleName, { since? })`.

## [0.2.0] - 2026-08-10
### Added
- `RBAC.createRole()`, `.grant()`, `.revoke()`, `.deleteRole()` — dynamic
  role management at runtime.
- Schema validation on write, reserved-name guard, circular-inheritance
  detection, dependents guard on delete.

## [0.1.0] - 2026-08-10
### Added
- Core Engine (`RBAC.can()`, role hierarchy resolution with cycle
  detection, condition evaluation) — isomorphic, zero runtime
  dependencies.
- `LocalJsonAdapter` — Node filesystem storage, tenant-isolated
  (`.rbac/tenants/<tenant>/` / `.rbac/_shared/`), `dataDir` auto-detection.
- Path/identifier sanitization against path traversal.
- Dual CJS+ESM+`.d.ts` build.
