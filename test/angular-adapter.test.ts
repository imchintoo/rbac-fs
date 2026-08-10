/**
 * rbac-fs/angular — exercised against a real `RBACClient` (docs/backlog/
 * adr-v0.9-frontend-adapters-batch2.md §6). `RbacService` and
 * `RbacCanDirective` are instantiated directly (`new`) — no Angular
 * `Injector`/`TestBed` needed, matching v0.6's `new RbacGuard(...)`
 * precedent — with a minimal structural fake `ViewContainerRef`
 * (`createEmbeddedView`/`clear` spies, the only two methods the directive
 * calls) and an opaque fake `TemplateRef`. No `can()` mock anywhere in
 * this file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TemplateRef, ViewContainerRef } from '@angular/core';
import { RBACClient } from '../src/client/index.js';
import { provideRbacClient, RbacCanDirective, RbacService, RBAC_CLIENT } from '../src/adapters/angular/index.js';

function makeClient(): RBACClient {
  return new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
  });
}

function makeViewContainer(): ViewContainerRef & { createCalls: number; clearCalls: number } {
  const vc = {
    createCalls: 0,
    clearCalls: 0,
    createEmbeddedView() {
      vc.createCalls += 1;
      return {} as never;
    },
    clear() {
      vc.clearCalls += 1;
    },
  };
  return vc as unknown as ViewContainerRef & { createCalls: number; clearCalls: number };
}

const fakeTemplateRef = {} as TemplateRef<unknown>;

test('provideRbacClient() returns an Angular Provider bound to RBAC_CLIENT', () => {
  const client = makeClient();
  const provider = provideRbacClient(client);
  assert.deepEqual(provider, { provide: RBAC_CLIENT, useValue: client });
});

test('RbacService.can() delegates to the real RBACClient', () => {
  const client = makeClient();
  const service = new RbacService(client);
  assert.equal(service.can('invoice', 'approve'), true);
  assert.equal(service.can('invoice', 'delete'), false);
});

test('RbacService.can() threads context through to conditional (`when`) grants', () => {
  const client = makeClient();
  const service = new RbacService(client);
  assert.equal(service.can('report', 'view', { owner_id: 'u1' }), true);
  assert.equal(service.can('report', 'view', { owner_id: 'someone-else' }), false);
});

test('RbacCanDirective creates the embedded view when allowed', () => {
  const client = makeClient();
  const service = new RbacService(client);
  const vc = makeViewContainer();
  const directive = new RbacCanDirective(fakeTemplateRef, vc, service);

  directive.rbacCan = 'invoice';
  directive.rbacCanAction = 'approve';
  directive.ngOnChanges();

  assert.equal(vc.createCalls, 1);
  assert.equal(vc.clearCalls, 0);
});

test('RbacCanDirective never creates a view when denied', () => {
  const client = makeClient();
  const service = new RbacService(client);
  const vc = makeViewContainer();
  const directive = new RbacCanDirective(fakeTemplateRef, vc, service);

  directive.rbacCan = 'invoice';
  directive.rbacCanAction = 'delete';
  directive.ngOnChanges();

  assert.equal(vc.createCalls, 0);
  assert.equal(vc.clearCalls, 0, 'clear() should not fire when a view was never created');
});

test('RbacCanDirective clears an existing view when a later ngOnChanges denies', () => {
  const client = makeClient();
  const service = new RbacService(client);
  const vc = makeViewContainer();
  const directive = new RbacCanDirective(fakeTemplateRef, vc, service);

  directive.rbacCan = 'invoice';
  directive.rbacCanAction = 'approve';
  directive.ngOnChanges();
  assert.equal(vc.createCalls, 1);

  directive.rbacCanAction = 'delete';
  directive.ngOnChanges();
  assert.equal(vc.clearCalls, 1);
});

test('RbacCanDirective does not re-create an already-created view on repeated ngOnChanges', () => {
  const client = makeClient();
  const service = new RbacService(client);
  const vc = makeViewContainer();
  const directive = new RbacCanDirective(fakeTemplateRef, vc, service);

  directive.rbacCan = 'invoice';
  directive.rbacCanAction = 'approve';
  directive.ngOnChanges();
  directive.ngOnChanges();
  directive.ngOnChanges();

  assert.equal(vc.createCalls, 1, 'createEmbeddedView should only fire once while allowed stays true');
});

test('RbacCanDirective threads rbacCanContext through to conditional (`when`) grants', () => {
  const client = makeClient();
  const service = new RbacService(client);
  const vc = makeViewContainer();
  const directive = new RbacCanDirective(fakeTemplateRef, vc, service);

  directive.rbacCan = 'report';
  directive.rbacCanAction = 'view';
  directive.rbacCanContext = { owner_id: 'u1' };
  directive.ngOnChanges();

  assert.equal(vc.createCalls, 1, 'owner_id == user.id should match for their own report');
});
