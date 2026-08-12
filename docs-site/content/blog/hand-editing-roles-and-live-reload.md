---
title: Hand-editing roles and how live-reload picks it up
date: 2026-07-20
excerpt: Role files are cached in memory for speed — here's how rbac-fs's chokidar-backed watcher keeps that cache honest when someone edits a file by hand.
tags: live-reload, architecture
---

Caching a role file in memory after the first read is an easy performance win — re-parsing JSON from disk on every single `can()` call doesn't scale. But a cache is only safe if it can't go stale, and role files in `rbac-fs` are explicitly designed to be hand-editable, not just API-mutable.

## The problem a cache creates

```ts
await rbac.can(user, 'invoice', 'approve'); // reads + caches manager.json
```

If someone opens `.rbac/tenants/acme-corp/roles/manager.json` in an editor and adds a permission by hand — no API call, no `grant()` — a naive cache would keep serving the old, pre-edit version until the process restarts. That's a real footgun for a package whose whole pitch is "roles are just files you can edit."

## How the watcher fixes it

`rbac-fs` uses `chokidar` to watch the roles directory. A file change event invalidates that specific role's cache entry — the next `can()` call for that role re-reads from disk instead of serving the stale cached copy. No restart, no manual cache-bust call needed.

```ts
// terminal 1: your app is running, using the cached role
await rbac.can(user, 'invoice', 'delete'); // false — no delete permission yet

// meanwhile, someone hand-edits manager.json to add "delete" to invoice actions

await rbac.can(user, 'invoice', 'delete'); // true — picked up automatically
```

## When to turn it off

```ts
new LocalJsonAdapter({ cache: false });
```

Some filesystems don't support reliable file-watching — certain networked or shared volumes are the common case. If you're on one of those, disabling the cache entirely (every `can()` reads fresh from disk) is safer than trusting a watcher that might silently stop firing. You lose the performance benefit of caching, but you lose it deliberately and visibly, rather than getting quietly stale data.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html#live-reload">Live-reload details in Core Concepts →</a></div>

## A timing note worth knowing about

The watcher's underlying OS-level attach (`inotify` on Linux, `ReadDirectoryChangesW` on Windows) happens asynchronously after the watcher object is created — a file mutation that happens in that narrow window immediately after startup can be missed entirely, not just delayed. This matters most in tests that create a fresh `RBAC` instance and immediately mutate a role file; a short warm-up delay before the first mutation avoids flakiness. See [Hand-editing a role file, step by step](/blog/tutorial-hand-editing-and-live-reload.html) for the practical version of this.
