---
title: Building your first permission check with rbac-fs
date: 2026-08-05
excerpt: A tutorial-paced walkthrough of installing rbac-fs, creating a role, and running your first can() check, in both JavaScript and TypeScript.
tags: core-engine, tutorial
---

This is the slow version of the [Quick Start](/docs/quick-start.html) — same steps, more explanation of what each one is actually doing.

## Install

```bash
npm install rbac-fs
```

No database, no config file needed before your first call — `.rbac/` gets created lazily the first time you use it, not via a `postinstall` script (deliberately — postinstall scripts get flagged by supply-chain scanners in a lot of enterprise environments).

## Create an `RBAC` instance

```js
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
```

`tenantId` is optional. Passing one gets you a folder-isolated tenant (`.rbac/tenants/acme-corp/`); omitting it uses `.rbac/_shared/` — useful for platform-level roles that aren't scoped to a single customer.

## Create a role

```js
await rbac.createRole('manager', {
  permissions: [{ resource: 'invoice', actions: ['approve', 'view'] }],
});
```

This writes `.rbac/tenants/acme-corp/roles/manager.json` to disk. Open that file — it's exactly what you'd expect, human-readable JSON, nothing generated or obfuscated.

## Run your first check

```js
const user = { id: 'u1', role: 'manager' };
const allowed = await rbac.can(user, 'invoice', 'approve');
console.log(allowed); // true
```

`user` needs an `id` and a `role` at minimum — the `role` field is what `can()` uses to look up the role file; everything else on `user` is available to condition expressions via `context`/`user.*` paths if you use them later.

## The same thing in TypeScript

```ts
import { RBAC, type RbacUser } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

const user: RbacUser = { id: 'u1', role: 'manager' };
const allowed: boolean = await rbac.can(user, 'invoice', 'approve');
```

Identical behavior — the only difference is the `RbacUser` type import, which gives you autocomplete on the shape `can()` expects. No `.ts` compilation step is required to *use* the package either way; this only matters for your own project's toolchain.

## Don't forget close()

```js
await rbac.close();
```

`RBAC` holds two OS-level resources once you've made any calls: a file watcher (live-reload) and a log write stream (audit logging). `close()` releases both — skip it in a long-running server where the process doesn't exit until shutdown anyway, but always call it in scripts, tests, and CLI tools, or the process will hang after your code appears to finish.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html">Full RBAC class API reference →</a></div>

Verified against [`examples/01-quickstart.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/01-quickstart.mjs), run directly against the real built package, not hand-typed and assumed correct.
