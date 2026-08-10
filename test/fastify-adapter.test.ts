/**
 * rbac-fs/fastify — exercised against a real `RBAC` + `LocalJsonAdapter`
 * fixture and a real Fastify instance (docs/backlog/
 * adr-v0.8-backend-adapters-batch2.md §7), using Fastify's own
 * `app.inject()` test helper (no HTTP server bound). No `can()` mock
 * anywhere in this file.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { RBAC } from '../src/index.js';
import { rbacPlugin } from '../src/adapters/fastify/index.js';

let tmp: string;
let rbac: RBAC;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-fastify-'));
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
  await writeFile(join(tmp, '_shared', 'roles', 'approver.json'), JSON.stringify({ name: 'approver', permissions: [{ resource: 'invoice', actions: ['approve'] }] }));
  await writeFile(join(tmp, '_shared', 'roles', 'viewer.json'), JSON.stringify({ name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] }));
  rbac = new RBAC({ dataDir: tmp });
});

after(async () => {
  await rbac.close();
  await rm(tmp, { recursive: true, force: true });
});

test('allowed / denied / missing-user / unguarded-route behavior', async () => {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    const role = request.headers['x-role'];
    if (typeof role === 'string') {
      (request as unknown as { user: { id: string; role: string } }).user = { id: 'u1', role };
    }
  });
  await app.register(rbacPlugin, { rbac });
  app.get('/invoices/:id/approve', { config: { rbac: { resource: 'invoice', action: 'approve' } } }, async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true }));

  const allowed = await app.inject({ method: 'GET', url: '/invoices/1/approve', headers: { 'x-role': 'approver' } });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(JSON.parse(allowed.body), { ok: true });

  const denied = await app.inject({ method: 'GET', url: '/invoices/1/approve', headers: { 'x-role': 'viewer' } });
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(JSON.parse(denied.body), { error: 'Forbidden' });

  const noUser = await app.inject({ method: 'GET', url: '/invoices/1/approve', headers: {} });
  assert.equal(noUser.statusCode, 403);

  const unguarded = await app.inject({ method: 'GET', url: '/health', headers: {} });
  assert.equal(unguarded.statusCode, 200, 'a route with no config.rbac should be let through unchecked');

  await app.close();
});

test('custom getUser()/getContext() overrides are honored', async () => {
  const app = Fastify();
  await app.register(rbacPlugin, {
    rbac,
    getUser: (request) => {
      const role = request.headers['x-role'];
      return typeof role === 'string' ? { id: 'u2', role } : undefined;
    },
  });
  app.get('/invoices/:id/view', { config: { rbac: { resource: 'invoice', action: 'view' } } }, async () => ({ ok: true }));

  const response = await app.inject({ method: 'GET', url: '/invoices/1/view', headers: { 'x-role': 'viewer' } });
  assert.equal(response.statusCode, 200);

  await app.close();
});
