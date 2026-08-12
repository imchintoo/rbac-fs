/**
 * 08 — Koa: same rbacMiddleware(rbac, resource, action, options?) shape as
 * Express, but async/await native and reading the user from ctx.state
 * (Koa's own documented convention) instead of ctx.req.
 * Run: node examples/08-koa-middleware.mjs
 */
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

// No router dependency needed to demonstrate the adapter — rbacMiddleware
// is just a normal Koa middleware, composes with any router you already use
// (koa-router, @koa/router, etc.) exactly the same way.
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

const server = app.listen(4002, async () => {
  console.log('Koa example listening on :4002');

  const allowed = await fetch('http://localhost:4002/invoices/inv-1/approve', { method: 'POST', headers: { 'x-user-role': 'manager' } });
  console.log('manager ->', allowed.status, await allowed.json());

  const denied = await fetch('http://localhost:4002/invoices/inv-1/approve', { method: 'POST', headers: { 'x-user-role': 'viewer' } });
  console.log('viewer (no permission) ->', denied.status, await denied.json());

  server.close();
  await rbac.close();
});
