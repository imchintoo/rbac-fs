/**
 * rbac-fs/vue — exercised against a real `RBACClient` (docs/backlog/
 * adr-v0.7-frontend-adapters.md §7). The `v-can` directive is invoked
 * directly against a minimal structural fake element (`{ style: {
 * display } }` — the only DOM surface it actually touches), same
 * philosophy as v0.6's NestJS `ExecutionContext` fake. `usePermission()`/
 * `createRbacPlugin()` are exercised through a real Vue `App` instance via
 * `runWithContext` (no DOM mount needed, since neither reads/writes the
 * DOM). No `can()` mock anywhere in this file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from 'vue';
import { RBACClient } from '../src/client/index.js';
import { RBAC_CLIENT_KEY, createRbacPlugin, makeCanDirective, usePermission } from '../src/adapters/vue/index.js';

function makeClient(): RBACClient {
  return new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
  });
}

test('v-can directive shows the element when the real client allows it', () => {
  const client = makeClient();
  const directive = makeCanDirective(client);
  const el = { style: { display: '' } };
  directive.mounted?.(el, { value: { a: 'invoice', I: 'approve' } } as never, null as never, null as never);
  assert.equal(el.style.display, '');
});

test('v-can directive hides the element when denied', () => {
  const client = makeClient();
  const directive = makeCanDirective(client);
  const el = { style: { display: '' } };
  directive.mounted?.(el, { value: { a: 'invoice', I: 'delete' } } as never, null as never, null as never);
  assert.equal(el.style.display, 'none');
});

test('v-can directive re-evaluates on updated() — e.g. binding value changes between renders', () => {
  const client = makeClient();
  const directive = makeCanDirective(client);
  const el = { style: { display: '' } };

  directive.mounted?.(el, { value: { a: 'invoice', I: 'approve' } } as never, null as never, null as never);
  assert.equal(el.style.display, '');

  directive.updated?.(el, { value: { a: 'invoice', I: 'delete' } } as never, null as never, null as never);
  assert.equal(el.style.display, 'none');
});

test('v-can directive threads context through to conditional (`when`) grants', () => {
  const client = makeClient();
  const directive = makeCanDirective(client);

  const ownEl = { style: { display: '' } };
  directive.mounted?.(ownEl, { value: { a: 'report', I: 'view', context: { owner_id: 'u1' } } } as never, null as never, null as never);
  assert.equal(ownEl.style.display, '', 'owner_id == user.id should match for their own report');

  const otherEl = { style: { display: '' } };
  directive.mounted?.(otherEl, { value: { a: 'report', I: 'view', context: { owner_id: 'someone-else' } } } as never, null as never, null as never);
  assert.equal(otherEl.style.display, 'none');
});

test('createRbacPlugin() provides the client and registers the v-can directive on app.use()', () => {
  const client = makeClient();
  const app = createApp({});
  app.use(createRbacPlugin(client));

  assert.equal(app._context.provides[RBAC_CLIENT_KEY as unknown as string], client);
  const registered = app.directive('can') as import('vue').ObjectDirective | undefined;
  assert.equal(typeof registered?.mounted, 'function');
  assert.equal(typeof registered?.updated, 'function');
});

test('usePermission() resolves the installed client via runWithContext and evaluates correctly', () => {
  const client = makeClient();
  const app = createApp({});
  app.use(createRbacPlugin(client));

  const can = app.runWithContext(() => usePermission());
  assert.equal(can('invoice', 'approve'), true);
  assert.equal(can('invoice', 'delete'), false);
});

test('usePermission() throws when the plugin was never installed', () => {
  const app = createApp({});
  assert.throws(() => {
    app.runWithContext(() => usePermission());
  }, /createRbacPlugin/);
});
