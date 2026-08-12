/**
 * 09 — Fastify: register rbacPlugin once at the root app, then declare
 * `config: { rbac: { resource, action } }` per route. Must be registered
 * at the root, not inside an encapsulated sub-plugin, for the hook to see
 * sibling routes (rbacPlugin is wrapped in fastify-plugin for this reason
 * — see src/adapters/fastify/index.ts).
 * Run: node examples/09-fastify-plugin.mjs
 */
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
console.log('Fastify example listening on :4003');

const allowed = await fetch('http://localhost:4003/invoices/inv-1/approve', { method: 'POST', headers: { 'x-user-role': 'manager' } });
console.log('manager ->', allowed.status, await allowed.json());

const denied = await fetch('http://localhost:4003/invoices/inv-1/approve', { method: 'POST', headers: { 'x-user-role': 'viewer' } });
console.log('viewer (no permission) ->', denied.status, await denied.json());

await app.close();
await rbac.close();
