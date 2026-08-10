import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { LocalJsonAdapter } from '../src/adapters/local-json-adapter.js';
import { RBAC as CoreRBAC } from '../src/core/rbac.js';
import {
  CircularInheritanceError,
  InvalidIdentifierError,
  ReservedNameError,
  RoleAlreadyExistsError,
  RoleHasDependentsError,
  RoleNotFoundError,
  SchemaValidationError,
  UnsupportedOperationError,
  type AuditEntry,
  type RoleDefinition,
  type StorageAdapter,
} from '../src/core/types.js';
import { RBAC } from '../src/index.js';

/** Tiny in-memory StorageAdapter for testing core.rbac without touching fs. */
function fakeAdapter(byTenant: Record<string, Record<string, RoleDefinition>>): StorageAdapter {
  const key = (tenantId: string | null) => tenantId ?? '_shared';
  return {
    async loadRole(tenantId, roleName) {
      return byTenant[key(tenantId)]?.[roleName] ?? null;
    },
    async loadAllRoles(tenantId) {
      return Object.values(byTenant[key(tenantId)] ?? {});
    },
    async saveRole() {
      throw new Error('not used in this test');
    },
    async deleteRole() {
      throw new Error('not used in this test');
    },
    async appendLog() {
      // no-op
    },
  };
}

test('can() returns true for an unconditional grant', async () => {
  const adapter = fakeAdapter({
    _shared: { manager: { name: 'manager', permissions: [{ resource: 'invoice', actions: ['approve'] }] } },
  });
  const rbac = new CoreRBAC({ adapter });
  const allowed = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
  assert.equal(allowed, true);
});

test('can() returns false when no grant matches', async () => {
  const adapter = fakeAdapter({
    _shared: { viewer: { name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] } },
  });
  const rbac = new CoreRBAC({ adapter });
  const allowed = await rbac.can({ id: 'u1', role: 'viewer' }, 'invoice', 'approve');
  assert.equal(allowed, false);
});

test('can() resolves inherited permissions through the role chain', async () => {
  const adapter = fakeAdapter({
    _shared: {
      viewer: { name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] },
      manager: { name: 'manager', inherits: ['viewer'], permissions: [{ resource: 'invoice', actions: ['approve'] }] },
    },
  });
  const rbac = new CoreRBAC({ adapter });
  assert.equal(await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'view'), true);
  assert.equal(await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve'), true);
});

test('can() evaluates conditional grants against context', async () => {
  const adapter = fakeAdapter({
    _shared: {
      employee: {
        name: 'employee',
        permissions: [],
        conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
      },
    },
  });
  const rbac = new CoreRBAC({ adapter });
  const user = { id: 'u1', role: 'employee' };
  assert.equal(await rbac.can(user, 'report', 'view', { owner_id: 'u1' }), true);
  assert.equal(await rbac.can(user, 'report', 'view', { owner_id: 'someone-else' }), false);
});

test('constructor rejects a malicious tenantId immediately (fails fast, not on first call)', () => {
  const adapter = fakeAdapter({});
  assert.throws(() => new CoreRBAC({ tenantId: '../../etc', adapter }), InvalidIdentifierError);
});

test('can() rejects a malicious role name before resolving anything', async () => {
  const adapter = fakeAdapter({});
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.can({ id: 'u1', role: '../../etc' }, 'x', 'y'), InvalidIdentifierError);
});

test('close() calls the adapter\'s close() if present', async () => {
  let closed = false;
  const adapter: StorageAdapter = {
    async loadRole() {
      return null;
    },
    async loadAllRoles() {
      return [];
    },
    async saveRole() {},
    async deleteRole() {},
    async appendLog() {},
    async close() {
      closed = true;
    },
  };
  const rbac = new CoreRBAC({ adapter });
  await rbac.close();
  assert.equal(closed, true);
});

test('close() is a no-op (does not throw) when the adapter has no close()', async () => {
  const { adapter } = recordingAdapter({}); // recordingAdapter doesn't implement close
  const rbac = new CoreRBAC({ adapter });
  await assert.doesNotReject(() => rbac.close());
});

test('listRoles() returns all roles for the tenant', async () => {
  const adapter = fakeAdapter({
    _shared: {
      viewer: { name: 'viewer', permissions: [] },
      manager: { name: 'manager', permissions: [] },
    },
  });
  const rbac = new CoreRBAC({ adapter });
  const roles = await rbac.listRoles();
  assert.equal(roles.length, 2);
});

test('multi-tenant isolation at the RBAC level: same role name, different tenant data, no leakage', async () => {
  const adapter = fakeAdapter({
    'acme-corp': { admin: { name: 'admin', permissions: [{ resource: 'invoice', actions: ['approve'] }] } },
    'globex-inc': { admin: { name: 'admin', permissions: [{ resource: 'ledger', actions: ['view'] }] } },
  });
  const acmeRbac = new CoreRBAC({ tenantId: 'acme-corp', adapter });
  const globexRbac = new CoreRBAC({ tenantId: 'globex-inc', adapter });
  const user = { id: 'u1', role: 'admin' };

  assert.equal(await acmeRbac.can(user, 'invoice', 'approve'), true);
  assert.equal(await acmeRbac.can(user, 'ledger', 'view'), false); // acme admin never got ledger:view
  assert.equal(await globexRbac.can(user, 'ledger', 'view'), true);
  assert.equal(await globexRbac.can(user, 'invoice', 'approve'), false); // globex admin never got invoice:approve
});

/** In-memory StorageAdapter that actually supports mutation, for v0.2 tests. */
function mutableFakeAdapter(seed: Record<string, RoleDefinition> = {}): { adapter: StorageAdapter; store: Record<string, RoleDefinition> } {
  const store: Record<string, RoleDefinition> = { ...seed };
  const adapter: StorageAdapter = {
    async loadRole(_tenantId, roleName) {
      return store[roleName] ?? null;
    },
    async loadAllRoles() {
      return Object.values(store);
    },
    async saveRole(_tenantId, role) {
      store[role.name] = role;
    },
    async deleteRole(_tenantId, roleName) {
      delete store[roleName];
    },
    async appendLog() {
      // no-op
    },
  };
  return { adapter, store };
}

// --- v0.3: audit logging wiring on can(), getAuditLog() ---

function recordingAdapter(byTenant: Record<string, Record<string, RoleDefinition>>): { adapter: StorageAdapter; logged: AuditEntry[] } {
  const logged: AuditEntry[] = [];
  const key = (tenantId: string | null) => tenantId ?? '_shared';
  const adapter: StorageAdapter = {
    async loadRole(tenantId, roleName) {
      return byTenant[key(tenantId)]?.[roleName] ?? null;
    },
    async loadAllRoles(tenantId) {
      return Object.values(byTenant[key(tenantId)] ?? {});
    },
    async saveRole() {
      throw new Error('not used in this test');
    },
    async deleteRole() {
      throw new Error('not used in this test');
    },
    async appendLog(_tenantId, _roleName, entry) {
      logged.push(entry);
    },
    async loadAuditLog() {
      return logged;
    },
  };
  return { adapter, logged };
}

test('can() logs an allow outcome', async () => {
  const { adapter, logged } = recordingAdapter({
    _shared: { manager: { name: 'manager', permissions: [{ resource: 'invoice', actions: ['approve'] }] } },
  });
  const rbac = new CoreRBAC({ adapter });
  await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.result, 'allow');
  assert.equal(logged[0]?.action, 'invoice:approve');
  assert.equal(logged[0]?.user, 'u1');
});

test('can() also logs a deny outcome — audit trail is not allow-only', async () => {
  const { adapter, logged } = recordingAdapter({
    _shared: { viewer: { name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] } },
  });
  const rbac = new CoreRBAC({ adapter });
  await rbac.can({ id: 'u1', role: 'viewer' }, 'invoice', 'approve');
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.result, 'deny');
});

test('a logging failure does not change can()\'s returned result', async () => {
  const adapter: StorageAdapter = {
    async loadRole() {
      return { name: 'manager', permissions: [{ resource: 'invoice', actions: ['approve'] }] };
    },
    async loadAllRoles() {
      return [];
    },
    async saveRole() {},
    async deleteRole() {},
    async appendLog() {
      throw new Error('disk full (simulated)');
    },
  };
  const rbac = new CoreRBAC({ adapter });
  const allowed = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
  assert.equal(allowed, true); // logging threw, but the permission result is unaffected
});

test('getAuditLog delegates to the adapter and returns entries', async () => {
  const { adapter } = recordingAdapter({ _shared: { manager: { name: 'manager', permissions: [] } } });
  const rbac = new CoreRBAC({ adapter });
  await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
  const log = await rbac.getAuditLog('manager');
  assert.equal(log.length, 1);
});

test('getAuditLog throws UnsupportedOperationError when the adapter has no loadAuditLog', async () => {
  const adapter: StorageAdapter = {
    async loadRole() {
      return null;
    },
    async loadAllRoles() {
      return [];
    },
    async saveRole() {},
    async deleteRole() {},
    async appendLog() {},
    // no loadAuditLog — matches the optional-on-StorageAdapter design
  };
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.getAuditLog('manager'), UnsupportedOperationError);
});

// --- v0.2: createRole / grant / revoke / deleteRole ---

test('createRole writes a role with stamped meta timestamps', async () => {
  const { adapter, store } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  const role = await rbac.createRole('supervisor', { inherits: [] });
  assert.equal(role.name, 'supervisor');
  assert.ok(role.meta?.createdAt);
  assert.ok(role.meta?.updatedAt);
  assert.equal(store.supervisor?.name, 'supervisor');
});

test('createRole rejects an unknown input field (schema validation)', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.createRole('x', { notAField: true } as never), SchemaValidationError);
});

test('createRole rejects a reserved name without force', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.createRole('admin', {}), ReservedNameError);
});

test('createRole allows a reserved name with force: true', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.doesNotReject(() => rbac.createRole('admin', {}, { force: true }));
});

test('createRole rejects overwriting an existing role without force', async () => {
  const { adapter } = mutableFakeAdapter({ existing: { name: 'existing', permissions: [] } });
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.createRole('existing', {}), RoleAlreadyExistsError);
});

test('createRole rejects a missing inherits parent', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.createRole('supervisor', { inherits: ['ghost'] }), RoleNotFoundError);
});

test('createRole rejects a self-referential cycle', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.createRole('self', { inherits: ['self'] }), CircularInheritanceError);
});

test('createRole rejects a cycle introduced against existing roles (A exists inheriting B, now creating B inheriting A)', async () => {
  const { adapter } = mutableFakeAdapter({ a: { name: 'a', inherits: ['b'], permissions: [] } });
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.createRole('b', { inherits: ['a'] }), CircularInheritanceError);
});

test('grant merges actions into an existing resource entry, deduping', async () => {
  const { adapter } = mutableFakeAdapter({
    manager: { name: 'manager', permissions: [{ resource: 'invoice', actions: ['view'] }] },
  });
  const rbac = new CoreRBAC({ adapter });
  const updated = await rbac.grant('manager', { resource: 'invoice', actions: ['view', 'approve'] });
  const entry = updated.permissions?.find((p) => p.resource === 'invoice');
  assert.deepEqual(new Set(entry?.actions), new Set(['view', 'approve']));
  assert.equal(entry?.actions.length, 2); // no duplicate 'view'
});

test('grant on a non-existent role throws RoleNotFoundError', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.grant('ghost', { resource: 'x', actions: ['y'] }), RoleNotFoundError);
});

test('grant rejects a malformed permission', async () => {
  const { adapter } = mutableFakeAdapter({ manager: { name: 'manager', permissions: [] } });
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.grant('manager', { resource: 'x', actions: [] }), SchemaValidationError);
});

test('revoke removes only the listed actions and drops an emptied entry', async () => {
  const { adapter } = mutableFakeAdapter({
    manager: {
      name: 'manager',
      permissions: [
        { resource: 'invoice', actions: ['view', 'approve', 'reject'] },
        { resource: 'vendor', actions: ['view'] },
      ],
    },
  });
  const rbac = new CoreRBAC({ adapter });
  const updated = await rbac.revoke('manager', { resource: 'invoice', actions: ['approve', 'reject'] });
  const invoiceEntry = updated.permissions?.find((p) => p.resource === 'invoice');
  assert.deepEqual(invoiceEntry?.actions, ['view']);
  assert.ok(updated.permissions?.some((p) => p.resource === 'vendor')); // untouched

  const fullyRevoked = await rbac.revoke('manager', { resource: 'invoice', actions: ['view'] });
  assert.equal(fullyRevoked.permissions?.some((p) => p.resource === 'invoice'), false); // entry dropped, not left empty
});

test('revoke is idempotent — revoking something never granted does not throw', async () => {
  const { adapter } = mutableFakeAdapter({ manager: { name: 'manager', permissions: [] } });
  const rbac = new CoreRBAC({ adapter });
  await assert.doesNotReject(() => rbac.revoke('manager', { resource: 'invoice', actions: ['approve'] }));
});

test('deleteRole removes an existing, dependent-free role', async () => {
  const { adapter, store } = mutableFakeAdapter({ standalone: { name: 'standalone', permissions: [] } });
  const rbac = new CoreRBAC({ adapter });
  await rbac.deleteRole('standalone');
  assert.equal(store.standalone, undefined);
});

test('deleteRole is idempotent for a role that never existed', async () => {
  const { adapter } = mutableFakeAdapter();
  const rbac = new CoreRBAC({ adapter });
  await assert.doesNotReject(() => rbac.deleteRole('never-existed'));
});

test('deleteRole rejects a reserved name without force', async () => {
  const { adapter } = mutableFakeAdapter({ admin: { name: 'admin', permissions: [] } });
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.deleteRole('admin'), ReservedNameError);
});

test('deleteRole rejects a role that other roles still inherit from', async () => {
  const { adapter } = mutableFakeAdapter({
    viewer: { name: 'viewer', permissions: [] },
    manager: { name: 'manager', inherits: ['viewer'], permissions: [] },
  });
  const rbac = new CoreRBAC({ adapter });
  await assert.rejects(() => rbac.deleteRole('viewer'), RoleHasDependentsError);
});

test('deleteRole with force: true bypasses the dependents guard', async () => {
  const { adapter, store } = mutableFakeAdapter({
    viewer: { name: 'viewer', permissions: [] },
    manager: { name: 'manager', inherits: ['viewer'], permissions: [] },
  });
  const rbac = new CoreRBAC({ adapter });
  await rbac.deleteRole('viewer', { force: true });
  assert.equal(store.viewer, undefined);
});

// --- Full integration: public RBAC (index.ts) wired to LocalJsonAdapter ---

let tmp: string;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-e2e-'));
  await mkdir(join(tmp, 'tenants', 'acme-corp', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, 'tenants', 'acme-corp', 'roles', 'viewer.json'),
    JSON.stringify({ name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] }),
  );
  await writeFile(
    join(tmp, 'tenants', 'acme-corp', 'roles', 'manager.json'),
    JSON.stringify({ name: 'manager', inherits: ['viewer'], permissions: [{ resource: 'invoice', actions: ['approve'] }] }),
  );
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('public RBAC defaults to LocalJsonAdapter with no adapter passed (docs/PLAN.md §7 usage)', async () => {
  const rbac = new RBAC({ tenantId: 'acme-corp', dataDir: tmp });
  try {
    const user = { id: 'u1', role: 'manager' };
    assert.equal(await rbac.can(user, 'invoice', 'view'), true); // via inheritance
    assert.equal(await rbac.can(user, 'invoice', 'approve'), true);
    assert.equal(await rbac.can(user, 'invoice', 'reject'), false);
  } finally {
    // rbac.close() (v0.5) — the auto-created LocalJsonAdapter isn't
    // reachable any other way, and its chokidar watcher (started by the
    // can() calls above) would otherwise keep the test process alive.
    await rbac.close();
  }
});

test('full v0.2 round-trip against real disk: createRole -> grant -> can() -> revoke -> can() -> deleteRole', async () => {
  const rbac = new RBAC({ tenantId: 'acme-corp', dataDir: tmp });
  try {
    const user = { id: 'u2', role: 'supervisor' };

    await rbac.createRole('supervisor', { inherits: ['viewer'] });
    assert.equal(await rbac.can(user, 'invoice', 'reject'), false);

    await rbac.grant('supervisor', { resource: 'invoice', actions: ['reject'] });
    assert.equal(await rbac.can(user, 'invoice', 'reject'), true);
    assert.equal(await rbac.can(user, 'invoice', 'view'), true); // still inherited from viewer

    await rbac.revoke('supervisor', { resource: 'invoice', actions: ['reject'] });
    assert.equal(await rbac.can(user, 'invoice', 'reject'), false);

    await rbac.deleteRole('supervisor');
    await assert.rejects(() => rbac.can(user, 'invoice', 'view'), RoleNotFoundError); // role is gone
  } finally {
    await rbac.close();
  }
});

test('full v0.3 round-trip against real disk: can() writes an audit entry that getAuditLog reads back', async () => {
  const explicitAdapter = new LocalJsonAdapter({ dataDir: tmp });
  try {
    const rbac = new RBAC({ tenantId: 'acme-corp', adapter: explicitAdapter });
    // Own role, not the shared 'manager'/'viewer' fixture roles other tests
    // in this file also call can() against in the same tmp dir — v0.3 logs
    // every can() call, so sharing a role name would accumulate entries
    // across tests and make this assertion order-dependent.
    await rbac.createRole('auditee', { permissions: [{ resource: 'invoice', actions: ['view'] }] });
    const user = { id: 'u3', role: 'auditee' };
    await rbac.can(user, 'invoice', 'view');
    await rbac.can(user, 'invoice', 'reject'); // auditee doesn't have reject — a deny, should still be logged

    const log = await rbac.getAuditLog('auditee');
    assert.equal(log.length, 2);
    assert.ok(log.some((e) => e.action === 'invoice:view' && e.result === 'allow'));
    assert.ok(log.some((e) => e.action === 'invoice:reject' && e.result === 'deny'));
  } finally {
    await explicitAdapter.close();
  }
});
