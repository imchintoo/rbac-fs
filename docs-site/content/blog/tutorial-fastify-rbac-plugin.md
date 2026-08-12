---
title: "Tutorial: the Fastify rbacPlugin end to end"
date: 2026-06-28
excerpt: A runnable Fastify example covering plugin registration, per-route rbac config, and both the allowed and denied response paths.
tags: fastify, tutorial
---

Runnable as-is: `node examples/09-fastify-plugin.mjs`.

## Full example

```js
import Fastify from 'fastify';
import { RBAC } from 'rbac-fs';
import { rbacPlugin } from 'rbac-fs/fastify';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });

const app = Fastify();

app.addHook('onRequest', async (request) => {
  const role = request.headers['x-user-role'];
  if (role) request.user = { id: 'demo-user', role };
});

await app.register(rbacPlugin, { rbac });

app.post(
  '/invoices/:id/approve',
  { config: { rbac: { resource: 'invoice', action: 'approve' } } },
  async (request) => ({ approved: request.params.id }),
);

await app.listen({ port: 4003 });
```

## Two requests, two outcomes

```js
const allowed = await fetch('http://localhost:4003/invoices/inv-1/approve', {
  method: 'POST',
  headers: { 'x-user-role': 'manager' },
});
console.log(allowed.status); // 200

const denied = await fetch('http://localhost:4003/invoices/inv-1/approve', {
  method: 'POST',
  headers: { 'x-user-role': 'viewer' },
});
console.log(denied.status); // 403 — viewer has no invoice:approve permission
```

## The one thing to double-check when you copy this

If a route you expect to be guarded is returning 200 for a role that shouldn't have access, check registration order first: `rbacPlugin` needs `app.register(...)` to happen at the root of your app, before any sub-plugin boundary — see [Why the Fastify adapter is a plugin, not middleware](/blog/why-the-fastify-adapter-is-a-plugin-not-middleware.html) for why that's a hard Fastify encapsulation rule, not a `rbac-fs` quirk.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html">Full adapter API reference →</a></div>

Verified against [`examples/09-fastify-plugin.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/09-fastify-plugin.mjs), which runs this exact sequence against a live server on port 4003.
