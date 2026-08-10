# Story: v0.5 — File Watcher (chokidar) for Live-Reload

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-5
plan-ref: "docs/PLAN.md §9 (v0.5 row), §3.1 (StorageAdapter.watch), §1 (dynamic roles goal)"

## Problem statement
`adr-v0.1-core-engine.md` flagged this explicitly: role resolution isn't
cached across `can()` calls in v0.1–v0.4, "no invalidation mechanism
exists yet — that's v0.5's file watcher." Today every `can()` re-reads
role files from disk every time — correct, but leaves real performance on
the table for a hot permission-check path, and `StorageAdapter.watch` has
sat as an unused optional interface method since v0.1.

## Requirements (acceptance criteria)
1. `LocalJsonAdapter` caches loaded role definitions in memory, so
   repeated `can()` calls against the same role don't re-read + re-parse
   the JSON file every time.
2. A role file hand-edited on disk (not through `createRole`/`grant`/etc.)
   is picked up automatically — the cache invalidates itself via a
   `chokidar` watch on the tenant's `roles/` directory, without requiring
   a process restart. This is the actual "live-reload" the roadmap name
   promises — caching without this would be a regression, not a feature.
3. `createRole`/`grant`/`revoke`/`deleteRole` invalidate their own cache
   entry immediately, synchronously with the write — don't rely on
   `chokidar` noticing the process's own write, which has unavoidable
   latency and would make our own API feel inconsistent for a moment
   after every mutation.
4. `StorageAdapter.watch(tenantId, callback)` (declared optional since
   v0.1, unused until now) is implemented on `LocalJsonAdapter` — external
   consumers can subscribe to `ChangeEvent`s for their own purposes (UI
   refresh, their own cache invalidation), independent of our internal
   cache-invalidation watcher.
5. Caching is overridable — `LocalJsonAdapterOptions.cache` (default
   `true`) can be set to `false` for consumers who want every `can()` call
   to always hit disk (e.g., environments where a local `chokidar` watch
   wouldn't see changes from another process/container writing to a
   networked filesystem — no false confidence in staleness guarantees
   there).
6. Watchers are cleaned up by the existing `close()` method (extended, not
   a new lifecycle method) — no dangling file-watch handles after
   `close()`.

## Explicitly out of scope
- Any change to `RBAC`'s public API — caching is entirely an adapter-layer
  concern, invisible to `RBAC.can()`'s callers (Core Engine still just
  calls `adapter.loadRole()`, doesn't know or care it's now cached).
- Cross-process cache invalidation over a network (e.g., Redis pub/sub) —
  `chokidar` only sees changes on the local filesystem it's watching;
  that's a `RemoteApiAdapter`-era (v1.x) concern, not this one.

## Success metrics
- QA shows: a role file edited directly on disk (outside the API) is
  reflected in the very next `can()` call without a restart; a
  `createRole`/`grant`/etc. call is reflected immediately, not after a
  `chokidar` debounce delay; `cache: false` genuinely bypasses the cache
  (verified, not assumed); `watch()` callbacks fire and its returned
  unsubscribe function actually stops delivery.

## Approval status
**APPROVED — proceeding to engineering-manager.**
