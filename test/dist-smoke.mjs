/**
 * Post-build smoke test — verifies dist/ actually works via plain
 * require()/import(), the way a real JS-only consumer would use it, with
 * no TypeScript toolchain involved (docs/PLAN.md §2.1's core promise).
 * Runs after `npm run build`, not as part of the source-level `npm test`
 * suite (which exercises src/ directly via tsx).
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// --- CJS require() ---
const cjs = require('../dist/index.cjs');
assert.equal(typeof cjs.RBAC, 'function', 'CJS: RBAC should be a function/class');
assert.equal(typeof cjs.LocalJsonAdapter, 'function', 'CJS: LocalJsonAdapter should be a function/class');

// --- ESM import() ---
const esm = await import('../dist/index.js');
assert.equal(typeof esm.RBAC, 'function', 'ESM: RBAC should be a function/class');
assert.equal(typeof esm.LocalJsonAdapter, 'function', 'ESM: LocalJsonAdapter should be a function/class');

// --- Behavioral smoke check against the built artifact (not source) ---
const tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-dist-smoke-'));
try {
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
  await writeFile(
    join(tmp, '_shared', 'roles', 'manager.json'),
    JSON.stringify({ name: 'manager', permissions: [{ resource: 'invoice', actions: ['approve'] }] }),
  );
  const rbac = new esm.RBAC({ dataDir: tmp });
  try {
    const allowed = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
    assert.equal(allowed, true, 'built RBAC should evaluate can() correctly against a real .rbac/ fixture');
    const denied = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'delete');
    assert.equal(denied, false);
  } finally {
    // v0.5: can() started a chokidar watcher via the default LocalJsonAdapter
    // — close() is the documented way to shut it down (also demonstrates
    // the pattern a real consumer should follow).
    await rbac.close();
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

// --- rbac-fs/client subpath: CJS require() + ESM import() + behavior ---
const clientCjs = require('../dist/client/index.cjs');
assert.equal(typeof clientCjs.RBACClient, 'function', 'CJS: RBACClient should be a function/class');

const clientEsm = await import('../dist/client/index.js');
assert.equal(typeof clientEsm.RBACClient, 'function', 'ESM: RBACClient should be a function/class');

const client = new clientEsm.RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['view'] }],
  conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
});
assert.equal(client.can('invoice', 'view'), true);
assert.equal(client.can('invoice', 'delete'), false);
assert.equal(client.can('report', 'view', { owner_id: 'u1' }), true);
assert.equal(client.can('report', 'view', { owner_id: 'someone-else' }), false);

console.log('dist smoke test: OK (CJS require + ESM import + can() both verified against built artifact, main + client)');
