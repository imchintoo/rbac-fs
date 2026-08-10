# Task: Implement v0.5 Role Cache + chokidar Watcher

status: done
owner: backend-engineer
created: 2026-08-10
plan-ref: "docs/backlog/adr-v0.5-file-watcher.md"
story: story-v0.5-file-watcher.md

## Sequenced sub-items
1. `LocalJsonAdapterOptions.cache?: boolean` (default true).
2. `roleCache`/`watchers`/`changeListeners` Maps + `ensureWatcher()`.
3. `loadRole`/`loadAllRoles` — cache-aware reads (loadRole only).
4. `saveRole`/`deleteRole` — synchronous cache invalidation.
5. `watch(tenantId, callback)` implementation.
6. `close()` — extend to close watchers.
7. Tests + `npm run verify`.

## Status log
- 2026-08-10 — task created, approved, handed to backend-engineer.
- 2026-08-10 — implemented: role cache + chokidar watcher (per tenant,
  shared between internal invalidation and `watch()`), `cache: false`
  escape hatch, `close()` extended to close watchers.
- 2026-08-10 — QA: found the test suite hangs (chokidar watchers keep the
  event loop alive, unlike v0.3's streams) — a real gap, not just a test
  issue, since `RBAC`'s public wrapper gave consumers no way to close its
  auto-created adapter at all. Fixed by adding `StorageAdapter.close?()` +
  `RBAC.close()`. 11 new watcher/cache tests + fixed all real-adapter test
  constructions across `test/` to close what they open. 103/103 tests,
  build, both smoke tests green, clean process exit confirmed.
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
