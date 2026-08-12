---
title: "Tutorial: guarding an Express route with rbac-fs"
date: 2026-07-02
excerpt: A runnable, curl-able Express example — one guarded route, three requests, three different outcomes, and the auth-ordering rule that makes it work.
tags: express, tutorial
---

This is runnable as-is: `node examples/07-express-middleware.mjs`, then hit it with curl from another terminal, or just read the fetch calls baked into the script.

## The full example

```js
import express from 'express';
import { RBAC } from 'rbac-fs';
import { rbacMiddleware } from 'rbac-fs/express';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });

const app = express();

// Stand-in for your real auth middleware — rbac-fs never assumes how a
// user got attached to the request, only that it's there by the time
// rbacMiddleware runs.
app.use((req, _res, next) => {
  const role = req.header('x-user-role');
  if (role) req.user = { id: 'demo-user', role };
  next();
});

app.post(
  '/invoices/:id/approve',
  rbacMiddleware(rbac, 'invoice', 'approve'),
  (req, res) => res.json({ approved: req.params.id }),
);

app.listen(4001);
```

## Three requests, three outcomes

```bash
curl -X POST http://localhost:4001/invoices/inv-1/approve -H 'x-user-role: manager'
# 200 { "approved": "inv-1" }

curl -X POST http://localhost:4001/invoices/inv-1/approve -H 'x-user-role: viewer'
# 403 — viewer role has no invoice:approve permission

curl -X POST http://localhost:4001/invoices/inv-1/approve
# 403 — no x-user-role header, so req.user was never set
```

## The auth-middleware ordering that matters

`rbacMiddleware` reads `req.user` — it does nothing to populate it. The header-reading middleware in this example stands in for your real auth layer (Passport, a JWT decode, a session lookup); in a real app, that middleware must run *before* `rbacMiddleware` in the chain, or every request will 403 with no user to check against.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/one-middleware-shape-express-koa-fastify.html">How this compares to the Koa and Fastify adapters →</a></div>

Verified against [`examples/07-express-middleware.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/07-express-middleware.mjs), which runs this exact sequence against a live server on port 4001.
