---
title: "Tutorial: guarding a Koa route with rbac-fs"
date: 2026-06-24
excerpt: A runnable Koa example — same rbacMiddleware shape as Express, ctx.state instead of req.user, three requests and three outcomes.
tags: koa, tutorial
---

Runnable as-is: `node examples/08-koa-middleware.mjs`.

## Full example

```js
import Koa from 'koa';
import { RBAC } from 'rbac-fs';
import { rbacMiddleware } from 'rbac-fs/koa';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });

const app = new Koa();

app.use(async (ctx, next) => {
  const role = ctx.get('x-user-role');
  if (role) ctx.state.user = { id: 'demo-user', role };
  await next();
});

const approveInvoice = rbacMiddleware(rbac, 'invoice', 'approve');
app.use(async (ctx, next) => {
  const match = ctx.path.match(/^\/invoices\/([^/]+)\/approve$/);
  if (ctx.method === 'POST' && match) {
    ctx.params = { id: match[1] };
    return approveInvoice(ctx, async () => {
      ctx.body = { approved: match[1] };
    });
  }
  return next();
});

app.listen(4002);
```

## Three requests, three outcomes

```js
const allowed = await fetch('http://localhost:4002/invoices/inv-1/approve', {
  method: 'POST',
  headers: { 'x-user-role': 'manager' },
});
console.log(allowed.status); // 200

const denied = await fetch('http://localhost:4002/invoices/inv-1/approve', {
  method: 'POST',
  headers: { 'x-user-role': 'viewer' },
});
console.log(denied.status); // 403

const noUser = await fetch('http://localhost:4002/invoices/inv-1/approve', { method: 'POST' });
console.log(noUser.status); // 403 — ctx.state.user was never set
```

## The ordering rule, same as Express

The `ctx.state.user`-setting middleware must run before `approveInvoice` in the chain — Koa middleware composes in registration order via `next()`, so an auth middleware registered after `rbacMiddleware` will run too late to matter.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/koa-ctx-state-and-async-native-middleware.html">Why the adapter reads ctx.state, not ctx.req →</a></div>

Verified against [`examples/08-koa-middleware.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/08-koa-middleware.mjs), which runs this exact sequence against a live server on port 4002.
