---
title: Why rbac-fs's live-reload never races its own writes
date: 2026-08-21
excerpt: The specific chokidar configuration and cache-invalidation ordering that keep rbac-fs's live-reload from ever serving a role it just wrote itself, or missing an edit from someone else.
tags: live-reload, architecture, core-engine
---

There's already a post on this blog about *why* rbac-fs's role files reload live — you edit a JSON file by hand, the in-memory cache updates, the next `can()` call sees the change, no restart. That post, and its companion tutorial, cover the what and the why. Neither covers the part that actually matters if you're deciding whether to trust this in production: the specific configuration choices that keep a file watcher from doing the two things file watchers are notorious for — missing a write, or racing your own.

This is the internals version. Every number and behavior below is read directly from `src/adapters/local-json-adapter.ts` and the shipped `docs/backlog/adr-v0.5-file-watcher.md`, not reconstructed from memory.

## The failure mode this has to avoid

File watchers have a well-documented race condition, and it's not specific to any one library. [chokidar's own issue tracker](https://github.com/paulmillr/chokidar/issues/1112) describes it plainly: a watcher first scans a directory's existing contents, and only *then* attaches the OS-level watch. Any file created in the gap between those two steps is invisible — the watcher never saw it, and nothing fires until some later event forces a re-scan. For a build tool, that's an annoying missed rebuild. For a permission cache, that's a role edit that silently never takes effect, which is a much worse failure mode: `can()` keeps returning `true` for a permission someone just revoked, or `false` for one someone just granted, and nothing in the API surface tells you it's stale.

rbac-fs sidesteps this specific race not by fighting chokidar's scan-then-watch ordering directly, but by controlling *when* the watcher gets created relative to the cache read it's protecting.

## `ignoreInitial: true` isn't cosmetic

```ts
const watcher = chokidarWatch(dir, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
});
```

chokidar fires a synthetic `'add'` event for every file already in a directory the moment a watcher starts on it. Without `ignoreInitial: true`, the very first `loadRole()` call on a tenant would trigger `ensureWatcher()`, which would immediately fire synthetic `add` events for every existing role file — deleting the cache entries `loadRole()` was in the middle of populating from that exact read. The watcher would defeat its own cache before the cache ever did anything. `ignoreInitial: true` isn't a minor tuning knob here; it's the difference between "cache exists" and "cache is invalidated on every single read."

## The `awaitWriteFinish` numbers are deliberately aggressive

`stabilityThreshold: 50, pollInterval: 10` — chokidar polls the file's size every 10ms and only fires the change event once it's stopped growing for 50ms. Current community guidance for file watchers in build pipelines (see [OneUptime's 2026 Node.js file-watching guide](https://oneuptime.com/blog/post/2026-01-22-nodejs-watch-file-changes/view)) recommends debouncing in the 400–1000ms range, specifically to avoid triggering a rebuild on every keystroke of an autosave-happy editor mid-typing.

rbac-fs's 50ms is roughly an order of magnitude tighter than that norm, and the reason is scope, not carelessness. A build watcher has to survive a human actively editing a file over several seconds. rbac-fs's watcher only has to survive a *save* — one `writeFile` call, or an editor's multi-chunk write, landing on a local disk. `awaitWriteFinish` exists here to protect against reading a role file mid-write from *some other process* — rbac-fs's own `saveRole` writes the entire JSON payload in a single `writeFile` call, so it never produces a partial-write window to protect against in the first place. A tighter threshold means an externally hand-edited role takes effect in roughly 60ms instead of up to a second, without meaningfully increasing the odds of reading a half-written file, because the write patterns this is guarding against are single-shot saves, not multi-second editing sessions.

## Own writes never wait on chokidar at all

This is the part that actually answers "can this race itself":

```ts
async saveRole(tenantId: string | null, role: RoleDefinition): Promise<void> {
  const filePath = this.roleFilePath(tenantId, role.name);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(role, null, 2) + '\n', 'utf-8');
  this.roleCache.set(`${this.tenantKey(tenantId)}::${role.name}`, role);
}
```

`saveRole` and `deleteRole` update the cache entry synchronously, in the same call, before the promise resolves. They do not wait for chokidar to notice the write and fire a `change` event — that event still fires eventually (chokidar has no way to know the write came from inside the process), and it still reaches any consumer registered via `watch()`, but the cache is already correct by the time `saveRole()` returns. If your code does `await rbac.grant(...)` followed immediately by `rbac.can(...)`, there's no window — however small — where a `chokidar` event queue delay could make that second call see stale data. The dependency runs one direction only: the cache depends on your own writes directly; it depends on chokidar exclusively for changes it didn't cause.

## What's deliberately left uncached

`loadAllRoles()` — the call behind `listRoles()` — is not cached at all. It always does a fresh `readdir` plus a `Promise.all` over the file reads. That's a conscious trade-off documented in the ADR: caching per-role reads solves the hot path (`can()`'s repeated `loadRole()` calls during inheritance resolution), and doing directory-level cache invalidation correctly — tracking additions and removals, not just edits to files chokidar already knows about — is real complexity that this story deliberately didn't take on. `listRoles()` is called far less often than `can()`, and leaving it uncached is also what keeps *brand-new* role files discoverable without needing chokidar's `add` event to double as a directory-index update mechanism.

And for filesystems chokidar can't watch reliably — some network mounts, in particular — there's an explicit escape hatch: `new LocalJsonAdapter({ cache: false })`. With caching off, `loadRole`/`loadAllRoles` never touch the cache and never trigger `ensureWatcher()` from the read path, so there's no stale-cache risk to reason about at all — every read hits disk. Change notifications via `watch()` still work independently, since notification and caching are separate concerns by design.

## Bottom line

None of this is exotic. The techniques — `ignoreInitial` to avoid self-inflicted cache eviction, `awaitWriteFinish` tuned to the actual write pattern you're protecting against rather than a generic default, synchronous self-invalidation so your own writes never depend on an async event you don't control the timing of, and an explicit off-switch for filesystems that don't cooperate — are all things any file-watching cache should do. The point of writing them down is that they're easy to get wrong quietly, and a permission system is a specifically bad place to find out you got one of them wrong.

```bash
npm install rbac-fs
```

Docs: [imchintoo.github.io/rbac-fs](https://imchintoo.github.io/rbac-fs/) · Package: [npmjs.com/package/rbac-fs](https://www.npmjs.com/package/rbac-fs) · Source: [github.com/imchintoo/rbac-fs](https://github.com/imchintoo/rbac-fs)
