/**
 * rbac-fs/express — exercised against a real `RBAC` + `LocalJsonAdapter`
 * fixture (docs/backlog/adr-v0.6-backend-adapters.md §7): no `can()` mock
 * anywhere in this file, only fake Express `req`/`res`/`next` plumbing.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { RBAC } from '../src/index.js';
import { rbacMiddleware } from '../src/adapters/express/index.js';

let tmp: string;
let rbac: RBAC;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-express-'));
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, '_shared', 'roles', 'approver.json'),
    JSON.stringify({ name: 'approver', permissions: [{ resource: 'invoice', actions: ['approve', 'view'] }] }),
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

/** Runs `handler(req, res, next)` and resolves once either `next()` fires (allow) or a `res.json()` deny/error response is sent. */
function invoke(handler: RequestHandler, req: Partial<Request>): Promise<{ status?: number; body?: unknown; nextCalled: boolean; nextErr?: unknown }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const result: { status?: number; body?: unknown; nextCalled: boolean; nextErr?: unknown } = { nextCalled: false };
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const res = {
      status(code: number) {
        result.status = code;
        return res;
      },
      json(body: unknown) {
        result.body = body;
        settle();
        return res;
      },
    } as unknown as Response;
    const next: NextFunction = ((err?: unknown) => {
      if (err) {
        result.nextErr = err;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      result.nextCalled = true;
      settle();
    }) as NextFunction;

    handler(req as Request, res, next);
  });
}

test('allowed user reaches next() with no res write', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve');
  const req = { user: { id: 'u1', role: 'approver' } } as unknown as Request;
  const result = await invoke(middleware, req);
  assert.equal(result.nextCalled, true);
  assert.equal(result.status, undefined);
});

test('denied user gets the default 403 response, next() not called', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve');
  const req = { user: { id: 'u2', role: 'viewer' } } as unknown as Request;
  const result = await invoke(middleware, req);
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'Forbidden' });
});

test('missing user (no auth middleware ran) is treated as denied, not an error', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve');
  const req = {} as unknown as Request;
  const result = await invoke(middleware, req);
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 403);
});

test('custom getUser() override is honored', async () => {
  const middleware = rbacMiddleware(rbac, 'invoice', 'view', {
    getUser: (req) => (req as unknown as { authUser?: { id: string; role: string } }).authUser,
  });
  const req = { authUser: { id: 'u3', role: 'viewer' } } as unknown as Request;
  const result = await invoke(middleware, req);
  assert.equal(result.nextCalled, true);
});

test('custom onDeny() override replaces the default 403 response', async () => {
  let denyCalled = false;
  const middleware = rbacMiddleware(rbac, 'invoice', 'approve', {
    onDeny: (_req, res) => {
      denyCalled = true;
      (res as unknown as { status: (n: number) => { json: (b: unknown) => void } }).status(418).json({ nope: true });
    },
  });
  const req = { user: { id: 'u2', role: 'viewer' } } as unknown as Request;
  const result = await invoke(middleware, req);
  assert.equal(denyCalled, true);
  assert.equal(result.status, 418);
});

test('resource/action as functions are resolved per-request from req', async () => {
  const middleware = rbacMiddleware(
    rbac,
    () => 'invoice',
    (req) => (req as unknown as { params: { action: string } }).params.action,
  );
  const allowedReq = { user: { id: 'u1', role: 'approver' }, params: { action: 'approve' } } as unknown as Request;
  const allowed = await invoke(middleware, allowedReq);
  assert.equal(allowed.nextCalled, true);

  const deniedReq = { user: { id: 'u2', role: 'viewer' }, params: { action: 'approve' } } as unknown as Request;
  const denied = await invoke(middleware, deniedReq);
  assert.equal(denied.status, 403);
});

test('getContext() is threaded through to conditional (`when`) grants', async () => {
  const middleware = rbacMiddleware(rbac, 'report', 'view', {
    getContext: (req) => ({ owner_id: (req as unknown as { user: { id: string } }).user.id }),
  });

  const ownReq = { user: { id: 'u3', role: 'viewer' } } as unknown as Request;
  const ownResult = await invoke(middleware, ownReq);
  assert.equal(ownResult.nextCalled, true, 'owner_id == user.id should match for their own report');

  const middlewareNoContext = rbacMiddleware(rbac, 'report', 'view');
  const otherResult = await invoke(middlewareNoContext, ownReq);
  assert.equal(otherResult.status, 403, 'without context, owner_id is undefined and should not match');
});

test('a throwing rbac.can() is forwarded to next(err), not swallowed', async () => {
  const brokenRbac = {
    can: async () => {
      throw new Error('boom');
    },
  };
  const middleware = rbacMiddleware(brokenRbac, 'invoice', 'approve');
  const req = { user: { id: 'u1', role: 'approver' } } as unknown as Request;
  await assert.rejects(() => invoke(middleware, req), /boom/);
});
