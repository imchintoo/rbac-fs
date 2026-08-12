---
title: One middleware shape, three Node HTTP frameworks
date: 2026-07-04
excerpt: rbac-fs's Express, Koa, and Fastify adapters share the same rbacMiddleware shape — here's what stays the same and what each framework forces to differ.
tags: express, adapters
---

`rbac-fs` ships three separate HTTP-framework adapters — Express, Koa, Fastify — and deliberately keeps them converged on the same call shape rather than three unrelated APIs.

## The shared signature

```ts
rbacMiddleware(rbac, resource, action, options?)
```

Express and Koa both use this exact function. A denied check returns a plain 403 by default; both `resource` and `action` can also be derived per-request via a function instead of a static string, for routes like `/invoices/:id/approve` where the resource ID matters but the permission's resource name (`'invoice'`) doesn't change per-request.

## Express

```js
import { rbacMiddleware } from 'rbac-fs/express';

app.post(
  '/invoices/:id/approve',
  rbacMiddleware(rbac, 'invoice', 'approve'),
  (req, res) => res.json({ approved: req.params.id }),
);
```

Reads the user from `req.user` — the convention practically every Express auth middleware (Passport included) already uses, so `rbac-fs` doesn't ask you to attach the user anywhere unusual.

## Koa

```js
import { rbacMiddleware } from 'rbac-fs/koa';

const approveInvoice = rbacMiddleware(rbac, 'invoice', 'approve');
app.use(async (ctx, next) => {
  if (ctx.method === 'POST' && /* route match */) {
    return approveInvoice(ctx, async () => { ctx.body = { approved: true }; });
  }
  return next();
});
```

Same function, but reads the user from `ctx.state.user` — Koa's own documented convention, not `ctx.req`. This is the one place the two adapters genuinely diverge, and it's Koa's convention forcing that, not an inconsistency in `rbac-fs`.

## Fastify: a plugin, not a middleware function

```js
import { rbacPlugin } from 'rbac-fs/fastify';

await app.register(rbacPlugin, { rbac });

app.post('/invoices/:id/approve',
  { config: { rbac: { resource: 'invoice', action: 'approve' } } },
  async (request) => ({ approved: request.params.id }),
);
```

Fastify's own plugin/hook architecture doesn't have an Express-style middleware chain, so the adapter is a registered `onRequest`-style plugin instead, and permission config moves into each route's `config.rbac` object rather than being a function wrapped around the handler. Same underlying `rbac.can()` call, framework-idiomatic shape on top.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html">Full middleware/plugin signatures →</a></div>

Runnable walkthroughs for each: [Express tutorial](/blog/tutorial-express-rbac-middleware.html), plus Koa and Fastify companions in this series.
