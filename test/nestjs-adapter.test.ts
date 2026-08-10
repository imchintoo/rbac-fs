/**
 * rbac-fs/nestjs — exercised against a real `RBAC` + `LocalJsonAdapter`
 * fixture and a real `Reflector` (docs/backlog/adr-v0.6-backend-adapters.md
 * §7): only the `ExecutionContext` is a minimal hand-built object (the one
 * piece of "framework plumbing" `RbacGuard` actually reads —
 * `getHandler()`/`getClass()`/`switchToHttp().getRequest()` — same
 * philosophy as `dist-smoke.mjs` exercising the real build instead of
 * mocking `fs`). No `can()` mock anywhere in this file.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RBAC } from '../src/index.js';
import { RBAC_TOKEN, RbacGuard, RequirePermission, provideRbac } from '../src/adapters/nestjs/index.js';

let tmp: string;
let rbac: RBAC;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-nestjs-'));
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, '_shared', 'roles', 'approver.json'),
    JSON.stringify({ name: 'approver', permissions: [{ resource: 'invoice', actions: ['approve'] }] }),
  );
  await writeFile(join(tmp, '_shared', 'roles', 'viewer.json'), JSON.stringify({ name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] }));
  rbac = new RBAC({ dataDir: tmp });
});

after(async () => {
  await rbac.close();
  await rm(tmp, { recursive: true, force: true });
});

// A real controller class carrying real Reflect metadata via the real
// @RequirePermission() decorator — not a hand-crafted metadata object.
class InvoiceController {
  @RequirePermission('invoice', 'approve')
  approve(): void {}

  // Deliberately no @RequirePermission() — proves the fail-open-on-missing-metadata path.
  list(): void {}
}

function makeContext(handler: () => void, request: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => InvoiceController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

test('allows the request when rbac.can() resolves true for the required permission', async () => {
  const guard = new RbacGuard(new Reflector(), rbac);
  const context = makeContext(InvoiceController.prototype.approve, { user: { id: 'u1', role: 'approver' } });
  assert.equal(await guard.canActivate(context), true);
});

test('throws ForbiddenException when rbac.can() resolves false', async () => {
  const guard = new RbacGuard(new Reflector(), rbac);
  const context = makeContext(InvoiceController.prototype.approve, { user: { id: 'u2', role: 'viewer' } });
  await assert.rejects(() => guard.canActivate(context), ForbiddenException);
});

test('a route with no @RequirePermission() metadata is let through unchecked (fail-open, by design)', async () => {
  const guard = new RbacGuard(new Reflector(), rbac);
  const context = makeContext(InvoiceController.prototype.list, {});
  assert.equal(await guard.canActivate(context), true);
});

test('throws ForbiddenException when the request has no resolvable user', async () => {
  const guard = new RbacGuard(new Reflector(), rbac);
  const context = makeContext(InvoiceController.prototype.approve, {});
  await assert.rejects(() => guard.canActivate(context), ForbiddenException);
});

test('a subclass can override getUser()/getContext() (Nest AuthGuard-style extension)', async () => {
  class CustomHeaderGuard extends RbacGuard {
    protected override getUser(req: { headers?: Record<string, string> }): { id: string; role: string } | undefined {
      const role = req.headers?.['x-role'];
      return role ? { id: 'header-user', role } : undefined;
    }
  }

  const guard = new CustomHeaderGuard(new Reflector(), rbac);
  const allowedContext = makeContext(InvoiceController.prototype.approve, { headers: { 'x-role': 'approver' } });
  assert.equal(await guard.canActivate(allowedContext), true);

  const deniedContext = makeContext(InvoiceController.prototype.approve, { headers: { 'x-role': 'viewer' } });
  await assert.rejects(() => guard.canActivate(deniedContext), ForbiddenException);
});

test('provideRbac() returns a Nest Provider bound to RBAC_TOKEN', () => {
  const provider = provideRbac(rbac);
  assert.deepEqual(provider, { provide: RBAC_TOKEN, useValue: rbac });
});

// Regression test for a real bug found during v0.6 QA: the built dist/ is
// produced by tsup/esbuild, not tsc, and esbuild does not emit
// `design:paramtypes` metadata without the optional @swc/core plugin — so
// a constructor param Nest would normally resolve purely from its TS type
// (`reflector: Reflector`, no explicit token) silently fails to inject in
// the *published* package even though it works fine here against `src/`
// via tsc. This spins up Nest's actual DI container (not a hand-built
// ExecutionContext, unlike the tests above) specifically to prove
// `RbacGuard` is constructible through real Nest DI, catching that class
// of bug instead of just asserting the fix's presence in source.
test('RbacGuard resolves correctly through Nest\'s real DI container (guards against missing design:paramtypes metadata)', async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [Reflector, RbacGuard, provideRbac(rbac)],
  }).compile();

  const guard = moduleRef.get(RbacGuard);
  assert.ok(guard instanceof RbacGuard);

  const context = makeContext(InvoiceController.prototype.approve, { user: { id: 'u1', role: 'approver' } });
  assert.equal(await guard.canActivate(context), true, 'a guard built by the real DI container should still evaluate permissions correctly');

  await moduleRef.close();
});
