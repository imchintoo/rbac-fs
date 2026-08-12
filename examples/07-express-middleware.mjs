/**
 * 07 — Express: rbacMiddleware(rbac, resource, action, options?) guards a
 * route. Deny is a plain 403 by default; resource/action can also be
 * derived per-request from req.params via a function.
 * Run: node examples/07-express-middleware.mjs
 * Then: curl http://localhost:4001/invoices/inv-1/approve -H 'x-user: manager'
 */
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
  rbacMiddleware(rbac, 'invoice', 'approve'), // static resource/action
  (req, res) => res.json({ approved: req.params.id }),
);

const server = app.listen(4001, async () => {
  console.log('Express example listening on :4001');

  const allowed = await fetch('http://localhost:4001/invoices/inv-1/approve', { method: 'POST', headers: { 'x-user-role': 'manager' } });
  console.log('manager ->', allowed.status, await allowed.json());

  const denied = await fetch('http://localhost:4001/invoices/inv-1/approve', { method: 'POST', headers: { 'x-user-role': 'viewer' } });
  console.log('viewer (no permission) ->', denied.status, await denied.json());

  const noUser = await fetch('http://localhost:4001/invoices/inv-1/approve', { method: 'POST' });
  console.log('no user attached ->', noUser.status, await noUser.json());

  server.close();
  await rbac.close();
});
