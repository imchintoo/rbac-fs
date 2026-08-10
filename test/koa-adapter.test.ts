/**
 * rbac-fs/koa — exercised against a real `RBAC` + `LocalJsonAdapter`
 * fixture (docs/backlog/adr-v0.8-backend-adapters-batch2.md §7): no
 * `can()` mock anywhere in this file, only a minimal structural fake `ctx`
 * (the fields the middleware actually touches: `state`/`status`/`body`).
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { Context, Middleware } from 'koa';
import { RBAC } from '../src/index.js';
import { rbacMiddleware } from '../src/adapters/koa/index.js';

let tmp: string;
let rbac: RBAC;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-koa-'));
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, '_shared', 'roles', 'approver.json'),
    JSON.stringify({ name: 'approver', permissions: [{ resource: 'invoice', actions: ['approve'] }] }),
  );
  await writeFile(
    join(tmp, '_shared', 'roles', 'viewer.json'),
    JSON.stringify({
      name: 'viewer',
      permissions: [{ resource: 'invoice', actions: ['view'] }],
      conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
    }),
  );
  rbac = new RBAC({ dataDir: tmp });
});

after(async () => {
  await rbac.close();
  await rm(tmp, { recursive: true, force: true });
});

function makeCtx(state: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Context {
  return { state, status: 200, body: undefined, ...extra } as unknown as Context;
}

async function run(middleware: Middleware, ctx: Context): Promise<{ nextCalled: boolean }> {
  let nextCalled = false;
  await middleware(ctx, async () => {
    nextCalled = true;
  });
  return { nextCalled };
}

test('allowed user calls next(), no response written', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve');
  const ctx = makeCtx({ user: { id: 'u1', role: 'approver' } });
  const { nextCalled } = await run(middleware, ctx);
  assert.equal(nextCalled, true);
  assert.equal(ctx.status, 200);
});

test('denied user gets the default 403 response, next() not called', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve');
  const ctx = makeCtx({ user: { id: 'u2', role: 'viewer' } });
  const { nextCalled } = await run(middleware, ctx);
  assert.equal(nextCalled, false);
  assert.equal(ctx.status, 403);
  assert.deepEqual(ctx.body, { error: 'Forbidden' });
});

test('missing user (no auth middleware ran) is treated as denied, not an error', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve');
  const ctx = makeCtx();
  const { nextCalled } = await run(middleware, ctx);
  assert.equal(nextCalled, false);
  assert.equal(ctx.status, 403);
});

test('custom getUser() override is honored', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'view', {
    getUser: (ctx) => (ctx as unknown as { authUser?: { id: string; role: string } }).authUser,
  });
  const ctx = makeCtx({}, { authUser: { id: 'u3', role: 'viewer' } });
  const { nextCalled } = await run(middleware, ctx);
  assert.equal(nextCalled, true);
});

test('custom onDeny() override replaces the default 403 response', async () => {
  let denyCalled = false;
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve', {
    onDeny: (ctx) => {
      denyCalled = true;
      ctx.status = 418;
      ctx.body = { nope: true };
    },
  });
  const ctx = makeCtx({ user: { id: 'u2', role: 'viewer' } });
  await run(middleware, ctx);
  assert.equal(denyCalled, true);
  assert.equal(ctx.status, 418);
});

test('resource/action as functions are resolved per-request from ctx', async () => {
  const middleware = rbacMiddleware(
    rbac,
    () => 'invoice',
    (ctx) => (ctx as unknown as { params: { action: string } }).params.action,
  );

  const allowedCtx = makeCtx({ user: { id: 'u1', role: 'approver' } }, { params: { action: 'approve' } });
  const { nextCalled: allowedNext } = await run(middleware, allowedCtx);
  assert.equal(allowedNext, true);

  const deniedCtx = makeCtx({ user: { id: 'u2', role: 'viewer' } }, { params: { action: 'approve' } });
  const { nextCalled: deniedNext } = await run(middleware, deniedCtx);
  assert.equal(deniedNext, false);
});

test('getContext() is threaded through to conditional (`when`) grants', async () => {
  const withContext = rbacMiddleware(rbac, 'report', 'view', {
    getContext: (ctx) => ({ owner_id: (ctx.state as { user: { id: string } }).user.id }),
  });
  const ownCtx = makeCtx({ user: { id: 'u3', role: 'viewer' } });
  const { nextCalled: ownAllowed } = await run(withContext, ownCtx);
  assert.equal(ownAllowed, true, 'owner_id == user.id should match for their own report');

  const withoutContext = rbacMiddleware(rbac, 'report', 'view');
  const otherCtx = makeCtx({ user: { id: 'u3', role: 'viewer' } });
  const { nextCalled: otherAllowed } = await run(withoutContext, otherCtx);
  assert.equal(otherAllowed, false, 'without context, owner_id is undefined and should not match');
});

test('a throwing rbac.can() propagates as a real thrown error (Koa convention, no swallowing)', async () => {
  const brokenRbac = {
    can: async (): Promise<boolean> => {
      throw new Error('boom');
    },
  };
  const middleware = rbacMiddleware(brokenRbac, 'invoice', 'approve');
  const ctx = makeCtx({ user: { id: 'u1', role: 'approver' } });
  await assert.rejects(() => run(middleware, ctx), /boom/);
});
