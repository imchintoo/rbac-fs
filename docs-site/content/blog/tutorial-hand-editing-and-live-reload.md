---
title: "Tutorial: hand-editing a role file, live"
date: 2026-07-18
excerpt: A step-by-step demo of rbac-fs's live-reload — edit a role JSON file directly and see the permission change without restarting anything.
tags: live-reload, tutorial
---

This is a small, runnable demo you can do yourself in about two minutes — no admin UI, no API calls, just editing a file.

## Set up a role and confirm the baseline

```js
import { RBAC } from 'rbac-fs';

const rbac = new RBAC(); // .rbac/_shared/
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });

const user = { id: 'u1', role: 'manager' };
console.log('before edit:', await rbac.can(user, 'invoice', 'delete')); // false
```

Run this — it'll print `false`, since `manager` only has `approve`, not `delete`.

## Open the file it just created

```text
.rbac/_shared/roles/manager.json
```

```json
{
  "name": "manager",
  "permissions": [
    { "resource": "invoice", "actions": ["approve"] }
  ]
}
```

Add `"delete"` to the `actions` array by hand, in your editor, and save:

```json
{
  "name": "manager",
  "permissions": [
    { "resource": "invoice", "actions": ["approve", "delete"] }
  ]
}
```

## Check again, without restarting anything

```js
// still the same running process, same rbac instance
console.log('after edit:', await rbac.can(user, 'invoice', 'delete')); // true
```

If your script already exited, put both `can()` calls plus a short pause in one file, edit the JSON in another window during the pause, then let the script continue — that's the realistic version of what live-reload is actually for: an app that's already running, whose permissions get corrected by hand while it keeps serving traffic.

## Why this matters beyond a demo

This is the same mechanism a non-engineer teammate would use to fix a permission mistake in production without needing anyone to write code or deploy anything — open the file, make the edit, save it, done. It's also exactly why role files being plain, readable JSON (not a binary format or an encrypted blob) is a real requirement, not a nice-to-have: a human has to be able to make this edit correctly by hand.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html">See the full role file schema in Core Concepts →</a></div>

Verified against [`examples/06-live-reload-watcher.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/06-live-reload-watcher.mjs).
