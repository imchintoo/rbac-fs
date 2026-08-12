# Quick Start

Install → first `can()` call, in under 10 lines. No database to stand up, no config file to write first.

## 1. Install

```bash
npm install rbac-fs
```

Requires Node.js `>=20`. TypeScript is optional — every subpath ships plain `.js` (CJS + ESM) with bundled `.d.ts` types, so a `.js`-only project never needs a TypeScript compiler.

## 2. First permission check (JavaScript)

```js
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', {
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
});

const allowed = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
console.log(allowed); // true
```

## 3. Same thing, in TypeScript

```ts
import { RBAC, type RbacUser } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', {
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
});

const user: RbacUser = { id: 'u1', role: 'manager' };
const allowed: boolean = await rbac.can(user, 'invoice', 'approve');
```

Both snippets create `.rbac/tenants/acme-corp/roles/manager.json` on disk the first time they run. That file is the reviewable source of truth from then on — hand-editing it works too, and is picked up automatically (see [Core Concepts → Live-reload](/docs/core-concepts.html#live-reload)).

## 4. Always close() before your process exits

```js
await rbac.close();
```

`close()` releases the chokidar file watcher (live-reload) and the audit-log write stream — skipping it can leave the Node event loop alive after your app should have exited. See [`examples/01-quickstart.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/01-quickstart.mjs) for the full runnable version.

## Next

<div class="callout tip">Using a specific framework? Every adapter page under <strong>Adapters</strong> in the sidebar has its own copy-pasteable quick start — NestJS, Express, Fastify, Koa, React, Vue, Angular, and Svelte are all built in.</div>
