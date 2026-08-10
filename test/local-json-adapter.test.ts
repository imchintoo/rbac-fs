import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { LocalJsonAdapter, resolveDataDir } from '../src/adapters/local-json-adapter.js';
import { InvalidIdentifierError } from '../src/core/types.js';

let tmp: string;
// v0.5: LocalJsonAdapter lazily starts a chokidar watcher on first
// loadRole/loadAllRoles (cache defaults to true), which — unlike the v0.3
// audit-log streams — keeps the event loop alive until closed. Every
// adapter this file creates is tracked here and closed in `after()`
// rather than adding a `try/finally` to all 13 call sites individually.
const createdAdapters: LocalJsonAdapter[] = [];
function makeAdapter(options: ConstructorParameters<typeof LocalJsonAdapter>[0] = {}): LocalJsonAdapter {
  const adapter = new LocalJsonAdapter({ dataDir: tmp, ...options });
  createdAdapters.push(adapter);
  return adapter;
}

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-adapter-'));
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
  await writeFile(join(tmp, '_shared', 'roles', 'viewer.json'), JSON.stringify({ name: 'viewer', permissions: [] }));
  await mkdir(join(tmp, 'tenants', 'acme-corp', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, 'tenants', 'acme-corp', 'roles', 'admin.json'),
    JSON.stringify({ name: 'admin', permissions: [{ resource: 'invoice', actions: ['*'] }] }),
  );
  await mkdir(join(tmp, 'tenants', 'globex-inc', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, 'tenants', 'globex-inc', 'roles', 'admin.json'),
    JSON.stringify({ name: 'admin', permissions: [{ resource: 'ledger', actions: ['view'] }] }),
  );
});

after(async () => {
  await Promise.all(createdAdapters.map((adapter) => adapter.close()));
  await rm(tmp, { recursive: true, force: true });
});

test('loads a _shared role', async () => {
  const adapter = makeAdapter();
  const role = await adapter.loadRole(null, 'viewer');
  assert.equal(role?.name, 'viewer');
});

test('loads a tenant-scoped role', async () => {
  const adapter = makeAdapter();
  const role = await adapter.loadRole('acme-corp', 'admin');
  assert.equal(role?.permissions?.[0]?.resource, 'invoice');
});

test('missing role returns null, not a throw', async () => {
  const adapter = makeAdapter();
  const role = await adapter.loadRole(null, 'ghost');
  assert.equal(role, null);
});

test('loadAllRoles on a tenant with no roles dir returns empty array, not a throw', async () => {
  const adapter = makeAdapter();
  const roles = await adapter.loadAllRoles('no-such-tenant');
  assert.deepEqual(roles, []);
});

test('multi-tenant isolation: same role name, different tenants, different content', async () => {
  const adapter = makeAdapter();
  const acme = await adapter.loadRole('acme-corp', 'admin');
  const globex = await adapter.loadRole('globex-inc', 'admin');
  assert.equal(acme?.permissions?.[0]?.resource, 'invoice');
  assert.equal(globex?.permissions?.[0]?.resource, 'ledger');
});

test('path traversal in tenantId is rejected before touching disk', async () => {
  const adapter = makeAdapter();
  await assert.rejects(() => adapter.loadRole('../../etc', 'admin'), InvalidIdentifierError);
});

test('path traversal in roleName is rejected before touching disk', async () => {
  const adapter = makeAdapter();
  await assert.rejects(() => adapter.loadRole(null, '../../../etc/passwd'), InvalidIdentifierError);
});

test('saveRole writes a role file that loadRole reads back identically (v0.2)', async () => {
  const adapter = makeAdapter();
  const role = { name: 'writer-test', permissions: [{ resource: 'doc', actions: ['write'] }] };
  await adapter.saveRole(null, role);
  const loaded = await adapter.loadRole(null, 'writer-test');
  assert.deepEqual(loaded, role);
});

test('saveRole creates the roles directory if it does not exist yet (fresh tenant)', async () => {
  const adapter = makeAdapter();
  const role = { name: 'first-role', permissions: [] };
  await adapter.saveRole('brand-new-tenant', role);
  const loaded = await adapter.loadRole('brand-new-tenant', 'first-role');
  assert.deepEqual(loaded, role);
});

test('deleteRole removes the file; a subsequent loadRole returns null', async () => {
  const adapter = makeAdapter();
  await adapter.saveRole(null, { name: 'to-delete', permissions: [] });
  await adapter.deleteRole(null, 'to-delete');
  assert.equal(await adapter.loadRole(null, 'to-delete'), null);
});

test('deleteRole is idempotent — deleting a non-existent role does not throw', async () => {
  const adapter = makeAdapter();
  await assert.doesNotReject(() => adapter.deleteRole(null, 'never-existed'));
});

test('saveRole/deleteRole still validate identifiers before touching disk', async () => {
  const adapter = makeAdapter();
  await assert.rejects(() => adapter.saveRole('../../etc', { name: 'x', permissions: [] }), InvalidIdentifierError);
  await assert.rejects(() => adapter.deleteRole(null, '../../etc/passwd'), InvalidIdentifierError);
});

test('appendLog is a no-op in v0.1 (does not throw)', async () => {
  const adapter = makeAdapter();
  await assert.doesNotReject(() =>
    adapter.appendLog(null, 'viewer', {
      ts: new Date().toISOString(),
      user: 'u1',
      role: 'viewer',
      action: 'x:y',
      resource: 'x',
      result: 'allow',
      tenantId: null,
    }),
  );
});

test('resolveDataDir: explicit option wins over everything', () => {
  const originalEnv = process.env.RBAC_DATA_DIR;
  process.env.RBAC_DATA_DIR = '/should-not-be-used';
  try {
    assert.equal(resolveDataDir('/explicit/path'), resolve('/explicit/path'));
  } finally {
    if (originalEnv === undefined) delete process.env.RBAC_DATA_DIR;
    else process.env.RBAC_DATA_DIR = originalEnv;
  }
});

test('resolveDataDir: env var wins when no explicit option', () => {
  const originalEnv = process.env.RBAC_DATA_DIR;
  process.env.RBAC_DATA_DIR = '/from/env';
  try {
    assert.equal(resolveDataDir(), resolve('/from/env'));
  } finally {
    if (originalEnv === undefined) delete process.env.RBAC_DATA_DIR;
    else process.env.RBAC_DATA_DIR = originalEnv;
  }
});

test('resolveDataDir: falls back to cwd()/.rbac when no package.json is found and no override set', async () => {
  const originalEnv = process.env.RBAC_DATA_DIR;
  delete process.env.RBAC_DATA_DIR;
  const isolatedCwd = await mkdtemp(join(tmpdir(), 'rbac-fs-nopkg-'));
  const originalCwd = process.cwd();
  process.chdir(isolatedCwd);
  try {
    // No package.json anywhere above a fresh temp dir under the OS tmp root
    // (tmp roots don't contain a package.json in CI/sandbox environments).
    const resolved = resolveDataDir();
    assert.equal(resolved, join(isolatedCwd, '.rbac'));
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
    if (originalEnv !== undefined) process.env.RBAC_DATA_DIR = originalEnv;
  }
});

test('resolveDataDir: auto-detects nearest ancestor package.json', async () => {
  const originalEnv = process.env.RBAC_DATA_DIR;
  delete process.env.RBAC_DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), 'rbac-fs-pkg-'));
  await writeFile(join(root, 'package.json'), '{}');
  const nested = join(root, 'a', 'b', 'c');
  await mkdir(nested, { recursive: true });
  const originalCwd = process.cwd();
  process.chdir(nested);
  try {
    const resolved = resolveDataDir();
    assert.equal(resolved, join(root, '.rbac'));
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true, force: true });
    if (originalEnv !== undefined) process.env.RBAC_DATA_DIR = originalEnv;
  }
});
