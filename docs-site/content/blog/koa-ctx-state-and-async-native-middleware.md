---
title: "Koa: why rbac-fs reads the user from ctx.state"
date: 2026-06-26
excerpt: rbac-fs's Koa adapter shares Express's rbacMiddleware signature but reads the user from ctx.state — Koa's own documented convention, not an arbitrary choice.
tags: koa, adapters
---

`rbac-fs/koa`'s `rbacMiddleware` is the same function signature as the Express adapter — `rbacMiddleware(rbac, resource, action, options?)` — composed the same async/await-native way Koa middleware already works. The one real difference is where it reads the current user from.

## ctx.state, not ctx.req

```js
import { rbacMiddleware } from 'rbac-fs/koa';

app.use(async (ctx, next) => {
  const role = ctx.get('x-user-role');
  if (role) ctx.state.user = { id: 'demo-user', role };
  await next();
});

const approveInvoice = rbacMiddleware(rbac, 'invoice', 'approve');
```

Koa's own docs designate `ctx.state` as "the recommended namespace for passing information through middleware and to your frontend views" — it's explicitly not `ctx.req` (Koa wraps Node's raw request/response rather than extending them the way Express does). `rbac-fs` follows that convention rather than inventing its own, so it composes cleanly with whatever auth middleware you're already using (`koa-jwt`, `koa-passport`, a custom session middleware) as long as that middleware also writes to `ctx.state.user`.

## Composes with any router

```js
// works identically with koa-router, @koa/router, or no router at all
router.post('/invoices/:id/approve', approveInvoice, async (ctx) => {
  ctx.body = { approved: ctx.params.id };
});
```

`rbacMiddleware`'s return value is just a normal Koa middleware function — nothing router-specific about it, so it slots into whatever routing setup your app already has without an adapter-specific integration step.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/one-middleware-shape-express-koa-fastify.html">How this compares to the Express and Fastify adapters →</a></div>

For a runnable, request-by-request walkthrough, see [Tutorial: guarding a Koa route with rbac-fs](/blog/tutorial-koa-rbac-middleware.html).
