# ADR: v0.5 — Role Cache + chokidar Live-Reload

status: approved
owner: solutions-architect
created: 2026-08-10
plan-ref: "docs/PLAN.md §3.1, §9 (v0.5); docs/backlog/story-v0.5-file-watcher.md"

## Context
`chokidar@5.0.0` installed and its real API verified directly (types read
from `node_modules/chokidar/index.d.ts`, not assumed from memory or an
older major version's docs — v5 dropped glob-string support that earlier
majors had, so this check mattered). API: `chokidar.watch(path, options)`
returns an `FSWatcher` (`EventEmitter`) with `'add'|'change'|'unlink'|
'error'` events and a `.close(): Promise<void>`.

## Decision

### Caching lives entirely in `LocalJsonAdapter` — Core Engine untouched
`role-resolver.ts` and `rbac.ts` keep calling `adapter.loadRole()` exactly
as before. Caching is invisible above the `StorageAdapter` boundary — the
same reason `saveRole`/`deleteRole`/`appendLog` all live in the adapter,
not `RBAC`. No public `RBAC` API changes in this story.

### One lazily-created chokidar watcher per tenant, shared by cache-invalidation and `watch()`
```ts
private watchers = new Map<string, FSWatcher>();          // tenantKey -> watcher
private roleCache = new Map<string, RoleDefinition | null>(); // `${tenantKey}::${roleName}` -> role | null
private changeListeners = new Map<string, Set<(e: ChangeEvent) => void>>();
```
`ensureWatcher(tenantId)` is called lazily from `loadRole`/`loadAllRoles`
(only if `cache !== false`) and from `watch()` (always, regardless of the
`cache` option — a consumer might want change notifications without
wanting us to cache on their behalf). One real `chokidar.watch()` call per
tenant's `roles/` dir, reused by both concerns — internal cache
invalidation always runs on every event; consumer callbacks registered via
`watch()` run alongside it, not instead of it.

`ignoreInitial: true` — chokidar fires synthetic `'add'` events for every
pre-existing file when a watch starts; without this, opening the watcher
would immediately invalidate every role we might have *just* cached from
the read that triggered `ensureWatcher()` in the first place, defeating
the cache before it does anything. `awaitWriteFinish: { stabilityThreshold:
50, pollInterval: 10 }` — avoids reading/invalidating against a
partially-written file mid-save (relevant for hand-edited files saved by
an editor that writes in chunks; our own `saveRole` already writes in one
`writeFile` call so this mostly protects against *other* writers).

### Own writes invalidate synchronously, never wait on chokidar
`saveRole`/`deleteRole` update/delete the specific `roleCache` entry
directly, in the same call, before returning — story requirement #3.
`chokidar` will *also* eventually fire for our own write (redundant but
harmless — cache is already correct by then, and the corresponding
`ChangeEvent` still needs to reach any `watch()` consumers, so we don't
suppress the event, only avoid depending on it for the cache being right).

### `cache: false` escape hatch
`LocalJsonAdapterOptions.cache` (default `true`). When `false`,
`loadRole`/`loadAllRoles` never touch `roleCache` and `ensureWatcher` is
never called from them (though `watch()` still works independently, since
change notifications and caching are separate concerns per the design
above). Addresses story requirement #5 (networked-filesystem correctness).

### `loadAllRoles` stays uncached
Deliberately out of scope for this story (noted in
`story-v0.5-file-watcher.md`) — the hot path this story targets is
`can()`'s repeated per-role `loadRole` calls during inheritance
resolution; `listRoles()` is called far less often and always does a fresh
`readdir` + reads, which is also what keeps *new* role files (not just
edited ones) discoverable without needing directory-level cache
invalidation logic. Simpler and correct; revisit only if `listRoles()`
perf becomes a real, evidenced concern.

### `close()` extended, not replaced
The existing `close()` (from v0.3, ends audit-log streams) now also closes
every cached chokidar watcher and clears the three new `Map`s. One
lifecycle method, not two.

## Consequences
- `StorageAdapter.watch` (declared optional since v0.1) has its first real
  implementation — nothing else in the codebase needed to change to
  support it; the interface was already correctly shaped.
- A future `PostgresAdapter`/`RemoteApiAdapter` (v1.x) can reasonably skip
  `watch` entirely (a database doesn't need filesystem watching) or
  implement it via `LISTEN`/`NOTIFY` or polling — `watch`'s optionality
  was exactly designed for this kind of adapter-specific capability gap.

## Verdict
**APPROVED — proceeding to tech-lead.**
