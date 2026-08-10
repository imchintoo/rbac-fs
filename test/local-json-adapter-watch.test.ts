import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { LocalJsonAdapter } from '../src/adapters/local-json-adapter.js';
import type { ChangeEvent } from '../src/core/types.js';

let tmp: string;
const createdAdapters: LocalJsonAdapter[] = [];
function makeAdapter(cache?: boolean): LocalJsonAdapter {
  const adapter = new LocalJsonAdapter({ dataDir: tmp, ...(cache !== undefined ? { cache } : {}) });
  createdAdapters.push(adapter);
  return adapter;
}

// chokidar's awaitWriteFinish (stabilityThreshold: 50ms) + real fs-event
// latency — generous but not open-ended, same order of magnitude as the
// v0.3 rotation tests' waits.
const SETTLE_MS = 400;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-watch-'));
  await mkdir(join(tmp, '_shared', 'roles'), { recursive: true });
});

after(async () => {
  await Promise.all(createdAdapters.map((adapter) => adapter.close()));
  await rm(tmp, { recursive: true, force: true });
});

test('a hand-edited role file on disk is picked up without a restart (live-reload)', async () => {
  const roleName = 'live-reload-target';
  const filePath = join(tmp, '_shared', 'roles', `${roleName}.json`);
  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [{ resource: 'x', actions: ['read'] }] }));

  const adapter = makeAdapter();
  const first = await adapter.loadRole(null, roleName);
  assert.equal(first?.permissions?.[0]?.actions[0], 'read');

  // Edit directly on disk — NOT through adapter.saveRole().
  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [{ resource: 'x', actions: ['write'] }] }));
  await delay(SETTLE_MS);

  const second = await adapter.loadRole(null, roleName);
  assert.equal(second?.permissions?.[0]?.actions[0], 'write', 'hand-edit should be reflected without a restart');
});

test('a hand-deleted role file on disk is reflected as null after the watcher notices', async () => {
  const roleName = 'live-delete-target';
  const filePath = join(tmp, '_shared', 'roles', `${roleName}.json`);
  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [] }));

  const adapter = makeAdapter();
  assert.ok(await adapter.loadRole(null, roleName));

  await unlink(filePath); // bypass adapter.deleteRole()
  await delay(SETTLE_MS);

  assert.equal(await adapter.loadRole(null, roleName), null);
});

test('caching actually happens: a hand-edit is NOT visible before the watcher has had time to fire', async () => {
  const roleName = 'cache-proof';
  const filePath = join(tmp, '_shared', 'roles', `${roleName}.json`);
  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [{ resource: 'x', actions: ['v1'] }] }));

  const adapter = makeAdapter();
  await adapter.loadRole(null, roleName); // populate the cache

  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [{ resource: 'x', actions: ['v2'] }] }));
  // No delay — read immediately. If there were no cache, this would
  // already see 'v2'; the point of this test is proving the cache is
  // real, not just that invalidation eventually happens (covered above).
  const immediate = await adapter.loadRole(null, roleName);
  assert.equal(immediate?.permissions?.[0]?.actions[0], 'v1', 'expected the cached value before the watcher has had time to invalidate it');
});

test('saveRole()/deleteRole() invalidate the cache synchronously — no wait needed', async () => {
  const roleName = 'own-write-target';
  const adapter = makeAdapter();

  await adapter.saveRole(null, { name: roleName, permissions: [{ resource: 'x', actions: ['v1'] }] });
  assert.equal((await adapter.loadRole(null, roleName))?.permissions?.[0]?.actions[0], 'v1');

  await adapter.saveRole(null, { name: roleName, permissions: [{ resource: 'x', actions: ['v2'] }] });
  // Immediate read, zero delay — proves this doesn't depend on chokidar.
  assert.equal((await adapter.loadRole(null, roleName))?.permissions?.[0]?.actions[0], 'v2');

  await adapter.deleteRole(null, roleName);
  assert.equal(await adapter.loadRole(null, roleName), null);
});

test('cache: false bypasses caching entirely — a hand-edit is visible immediately, no wait', async () => {
  const roleName = 'no-cache-target';
  const filePath = join(tmp, '_shared', 'roles', `${roleName}.json`);
  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [{ resource: 'x', actions: ['v1'] }] }));

  const adapter = makeAdapter(false);
  await adapter.loadRole(null, roleName);

  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [{ resource: 'x', actions: ['v2'] }] }));
  const immediate = await adapter.loadRole(null, roleName);
  assert.equal(immediate?.permissions?.[0]?.actions[0], 'v2', 'cache: false should always hit disk, no caching lag at all');
});

test('watch() delivers ChangeEvents for add/change/delete, and the returned unsubscribe stops delivery', async () => {
  const roleName = 'watched-role';
  const filePath = join(tmp, '_shared', 'roles', `${roleName}.json`);

  const adapter = makeAdapter();
  const events: ChangeEvent[] = [];
  const unsubscribe = adapter.watch(null, (event) => events.push(event));
  // watch() starting a brand-new chokidar watcher (no prior loadRole() to
  // have already warmed it up, unlike the other tests here) needs a beat
  // to finish its own initial setup before it reliably sees a write that
  // follows immediately — same category of timing as the rotation tests.
  await delay(100);

  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [] }));
  await delay(SETTLE_MS);
  assert.ok(events.some((e) => e.type === 'role-changed' && e.roleName === roleName), `expected a role-changed event, got: ${JSON.stringify(events)}`);

  await unlink(filePath);
  await delay(SETTLE_MS);
  assert.ok(events.some((e) => e.type === 'role-deleted' && e.roleName === roleName), `expected a role-deleted event, got: ${JSON.stringify(events)}`);

  unsubscribe();
  const countBeforeUnsub = events.length;
  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [] }));
  await delay(SETTLE_MS);
  assert.equal(events.length, countBeforeUnsub, 'no further events should be delivered after unsubscribe');
});

test('watch() works even with cache: false (notification and caching are independent concerns)', async () => {
  const roleName = 'watched-no-cache';
  const filePath = join(tmp, '_shared', 'roles', `${roleName}.json`);

  const adapter = makeAdapter(false);
  const events: ChangeEvent[] = [];
  adapter.watch(null, (event) => events.push(event));
  await delay(100); // let the freshly-created watcher finish its own setup — see the test above

  await writeFile(filePath, JSON.stringify({ name: roleName, permissions: [] }));
  await delay(SETTLE_MS);
  assert.ok(events.some((e) => e.roleName === roleName));
});

test('close() shuts down watchers without throwing, even if none were ever created', async () => {
  const adapter = new LocalJsonAdapter({ dataDir: tmp });
  await assert.doesNotReject(() => adapter.close());
});
