# Koa

Same `rbacMiddleware(rbac, resource, action, options?)` shape as Express, async/await native — `import { rbacMiddleware } from 'rbac-fs/koa'`.

## Usage

```js
import Koa from 'koa';
import { RBAC } from 'rbac-fs';
import { rbacMiddleware } from 'rbac-fs/koa';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

const app = new Koa();

app.use(async (ctx, next) => {
  const role = ctx.get('x-user-role');
  if (role) ctx.state.user = { id: 'demo-user', role }; // Koa's own convention: ctx.state, not ctx.req
  await next();
});

const approveInvoice = rbacMiddleware(rbac, 'invoice', 'approve');
app.use(async (ctx, next) => {
  if (ctx.method === 'POST' && /^\/invoices\/[^/]+\/approve$/.test(ctx.path)) {
    return approveInvoice(ctx, async () => {
      ctx.body = { approved: true };
    });
  }
  return next();
});
```

No router dependency required to use the adapter — `rbacMiddleware` composes with `koa-router`/`@koa/router` the same way any normal Koa middleware does. Full runnable version: [`examples/08-koa-middleware.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/08-koa-middleware.mjs).
