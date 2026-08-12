---
title: "Fastify's adapter is a plugin, not middleware"
date: 2026-06-30
excerpt: rbac-fs's Fastify adapter must be registered at the root app, not inside an encapsulated sub-plugin — the encapsulation rule that makes that a hard requirement.
tags: fastify, adapters
---

Fastify doesn't have a middleware chain in the Express sense — everything is a plugin, and plugins are encapsulated by default. `rbac-fs/fastify` respects that architecture instead of fighting it.

## Registration

```js
import Fastify from 'fastify';
import { rbacPlugin } from 'rbac-fs/fastify';

const app = Fastify();
await app.register(rbacPlugin, { rbac });

app.post(
  '/invoices/:id/approve',
  { config: { rbac: { resource: 'invoice', action: 'approve' } } },
  async (request) => ({ approved: request.params.id }),
);
```

Permission config lives in each route's `config.rbac` object — not a wrapper function around the handler like Express/Koa's `rbacMiddleware`. Fastify's own route-config mechanism is the natural place for this, and it means the check runs as an `onRequest`-style hook the plugin registers once, not per-route boilerplate.

## The encapsulation rule that actually matters

Fastify plugins are encapsulated by default: a hook or decorator registered inside a sub-plugin (via `fastify-plugin`'s opt-out, or a nested `register()` call) is invisible to sibling routes outside that sub-plugin's boundary. `rbacPlugin` is wrapped in `fastify-plugin` specifically so its `onRequest` hook attaches at the root instead of being trapped inside an encapsulation boundary — but that only works if *you* also register it at the root app, not inside your own sub-plugin.

```js
// wrong — hook won't see routes registered outside this sub-plugin
app.register(async (instance) => {
  await instance.register(rbacPlugin, { rbac });
  instance.post('/invoices/:id/approve', { config: { rbac: {...} } }, handler);
});

// right — register at the root, routes anywhere in the app are covered
await app.register(rbacPlugin, { rbac });
app.post('/invoices/:id/approve', { config: { rbac: {...} } }, handler);
```

Get this wrong and the symptom isn't an error — it's routes that silently skip the permission check entirely, which is worse than a crash.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/one-middleware-shape-express-koa-fastify.html">How Fastify's approach compares to Express and Koa →</a></div>

For a runnable walkthrough, see [Tutorial: the Fastify plugin end to end](/blog/tutorial-fastify-rbac-plugin.html).
