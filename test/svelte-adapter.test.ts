/**
 * rbac-fs/svelte — exercised against a real `RBACClient` (docs/backlog/
 * adr-v0.9-frontend-adapters-batch2.md §6). The `can` action is invoked
 * directly against a minimal structural fake element (`{ style: {
 * display } }` — the only DOM surface it touches), same philosophy as
 * v0.7's Vue directive tests. The permission store is exercised via its
 * real `subscribe()` contract. No `can()` mock anywhere in this file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RBACClient } from '../src/client/index.js';
import { createCanAction, createPermissionStore } from '../src/adapters/svelte/index.js';

function makeClient(): RBACClient {
  return new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
  });
}

test('createPermissionStore() calls subscribe synchronously with a working can() (Svelte store contract)', () => {
  const client = makeClient();
  const store = createPermissionStore(client);

  let received: RBACClient['can'] | undefined;
  const unsubscribe = store.subscribe((can) => {
    received = can;
  });

  assert.equal(typeof received, 'function', 'subscribe() must call run() synchronously per the Svelte store contract');
  assert.equal(received?.('invoice', 'approve'), true);
  assert.equal(received?.('invoice', 'delete'), false);
  assert.doesNotThrow(() => unsubscribe());
});

test('createPermissionStore()\'s value threads context through to conditional (`when`) grants', () => {
  const client = makeClient();
  const store = createPermissionStore(client);
  let can!: RBACClient['can'];
  store.subscribe((fn) => {
    can = fn;
  });

  assert.equal(can('report', 'view', { owner_id: 'u1' }), true);
  assert.equal(can('report', 'view', { owner_id: 'someone-else' }), false);
});

test('createCanAction(): the returned action shows the element when allowed', () => {
  const client = makeClient();
  const can = createCanAction(client);
  const node = { style: { display: '' } };

  can(node, { a: 'invoice', I: 'approve' });
  assert.equal(node.style.display, '');
});

test('createCanAction(): the returned action hides the element when denied', () => {
  const client = makeClient();
  const can = createCanAction(client);
  const node = { style: { display: '' } };

  can(node, { a: 'invoice', I: 'delete' });
  assert.equal(node.style.display, 'none');
});

test('createCanAction(): update() re-evaluates on new params', () => {
  const client = makeClient();
  const can = createCanAction(client);
  const node = { style: { display: '' } };

  const result = can(node, { a: 'invoice', I: 'approve' });
  assert.equal(node.style.display, '');

  result?.update?.({ a: 'invoice', I: 'delete' });
  assert.equal(node.style.display, 'none');
});

test('createCanAction(): context is threaded through to conditional (`when`) grants', () => {
  const client = makeClient();
  const can = createCanAction(client);

  const ownNode = { style: { display: '' } };
  can(ownNode, { a: 'report', I: 'view', context: { owner_id: 'u1' } });
  assert.equal(ownNode.style.display, '', 'owner_id == user.id should match for their own report');

  const otherNode = { style: { display: '' } };
  can(otherNode, { a: 'report', I: 'view', context: { owner_id: 'someone-else' } });
  assert.equal(otherNode.style.display, 'none');
});

test('two clients produce independently-bound actions', () => {
  const approverClient = makeClient();
  const viewerOnlyClient = new RBACClient({ user: { id: 'u2' }, permissions: [{ resource: 'invoice', actions: ['view'] }] });

  const canApprove = createCanAction(approverClient);
  const canViewOnly = createCanAction(viewerOnlyClient);

  const nodeA = { style: { display: '' } };
  canApprove(nodeA, { a: 'invoice', I: 'approve' });
  assert.equal(nodeA.style.display, '');

  const nodeB = { style: { display: '' } };
  canViewOnly(nodeB, { a: 'invoice', I: 'approve' });
  assert.equal(nodeB.style.display, 'none');
});
