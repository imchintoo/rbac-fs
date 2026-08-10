import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RBACClient } from '../src/client/index.js';

test('can() returns true for an unconditional grant in the snapshot', () => {
  const client = new RBACClient({ permissions: [{ resource: 'invoice', actions: ['approve'] }] });
  assert.equal(client.can('invoice', 'approve'), true);
});

test('can() returns false when nothing in the snapshot matches', () => {
  const client = new RBACClient({ permissions: [{ resource: 'invoice', actions: ['view'] }] });
  assert.equal(client.can('invoice', 'approve'), false);
});

test('can() is synchronous — no Promise involved', () => {
  const client = new RBACClient({ permissions: [{ resource: 'invoice', actions: ['view'] }] });
  const result = client.can('invoice', 'view');
  assert.equal(typeof result, 'boolean'); // not a Promise<boolean>
});

test('can() evaluates conditional grants using the snapshot\'s embedded user', () => {
  const client = new RBACClient({
    user: { id: 'u1' },
    permissions: [],
    conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
  });
  assert.equal(client.can('report', 'view', { owner_id: 'u1' }), true);
  assert.equal(client.can('report', 'view', { owner_id: 'someone-else' }), false);
});

test('can() with a condition but no snapshot.user resolves user.* paths to undefined (safe deny)', () => {
  const client = new RBACClient({
    permissions: [],
    conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
  });
  assert.equal(client.can('report', 'view', { owner_id: 'u1' }), false);
});

test('can() with no conditions array at all does not throw', () => {
  const client = new RBACClient({ permissions: [{ resource: 'x', actions: ['y'] }] });
  assert.equal(client.can('x', 'y'), true);
  assert.equal(client.can('a', 'b'), false);
});

test('RBACClient uses the same evaluator as RBAC.can() for identical permission data (parity check)', async () => {
  const { RBAC: CoreRBAC } = await import('../src/core/rbac.js');
  const permissions = [{ resource: 'invoice', actions: ['approve'] }];
  const conditions = [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }];

  const adapter = {
    async loadRole() {
      return { name: 'snapshot-role', permissions, conditions };
    },
    async loadAllRoles() {
      return [];
    },
    async saveRole() {},
    async deleteRole() {},
    async appendLog() {},
  };
  const serverSide = new CoreRBAC({ adapter });
  const client = new RBACClient({ user: { id: 'u1' }, permissions, conditions });

  const cases: Array<[string, string, Record<string, unknown>]> = [
    ['invoice', 'approve', {}],
    ['invoice', 'reject', {}],
    ['report', 'view', { owner_id: 'u1' }],
    ['report', 'view', { owner_id: 'someone-else' }],
  ];

  for (const [resource, action, context] of cases) {
    const serverResult = await serverSide.can({ id: 'u1', role: 'snapshot-role' }, resource, action, context);
    const clientResult = client.can(resource, action, context);
    assert.equal(clientResult, serverResult, `mismatch for ${resource}:${action} with context ${JSON.stringify(context)}`);
  }
});
