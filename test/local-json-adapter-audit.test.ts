import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { LocalJsonAdapter } from '../src/adapters/local-json-adapter.js';
import type { AuditEntry } from '../src/core/types.js';

let tmp: string;
let adapter: LocalJsonAdapter;

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: new Date().toISOString(),
    user: 'u1',
    role: 'manager',
    action: 'invoice:approve',
    resource: 'invoice',
    result: 'allow',
    tenantId: null,
    ...overrides,
  };
}

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'rbac-fs-audit-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  adapter = new LocalJsonAdapter({ dataDir: tmp, rotation: { maxSize: '300B', maxBackups: 3, compress: 'gzip', maxAge: '90d' } });
});

afterEach(async () => {
  await adapter.close();
});

test('appendLog writes a JSONL line readable back via loadAuditLog', async () => {
  const fresh = new LocalJsonAdapter({ dataDir: tmp });
  try {
    await fresh.appendLog(null, 'reader-role', entry({ role: 'reader-role' }));
    const log = await fresh.loadAuditLog(null, 'reader-role');
    assert.equal(log.length, 1);
    assert.equal(log[0]?.action, 'invoice:approve');
  } finally {
    await fresh.close();
  }
});

test('rotation actually happens once the active file crosses maxSize, and rotated files are gzip-compressed', async () => {
  const roleName = 'rotator';
  // Each line is ~140 bytes; with a 300B trigger, a handful of writes forces multiple rotations.
  for (let i = 0; i < 20; i++) {
    await adapter.appendLog(null, roleName, entry({ role: roleName, ts: new Date(2026, 0, 1, 0, 0, i).toISOString() }));
  }
  await adapter.close();
  // Give the library's async rotation/compression a moment to settle after close().
  await delay(200);

  const dir = join(tmp, '_shared', 'logs');
  const files = await readdir(dir);
  const rotated = files.filter((f) => f.startsWith(`${roleName}.jsonl.`));
  assert.ok(rotated.length > 0, `expected at least one rotated file, got: ${files.join(', ')}`);
  assert.ok(
    rotated.every((f) => f.endsWith('.gz')),
    `expected all rotated files gzip-compressed, got: ${rotated.join(', ')}`,
  );
});

test('maxBackups caps the number of rotated files kept', async () => {
  const roleName = 'capped';
  for (let i = 0; i < 40; i++) {
    await adapter.appendLog(null, roleName, entry({ role: roleName, ts: new Date(2026, 0, 1, 0, 0, i).toISOString() }));
  }
  await adapter.close();
  await delay(300);

  const dir = join(tmp, '_shared', 'logs');
  const files = await readdir(dir);
  const rotated = files.filter((f) => f.startsWith(`${roleName}.jsonl.`));
  assert.ok(rotated.length <= 3, `expected at most maxBackups(3) rotated files, got ${rotated.length}: ${rotated.join(', ')}`);
});

test('loadAuditLog reads across active + rotated + gzipped files and returns them sorted', async () => {
  const roleName = 'spanning';
  // A generous maxBackups here (unlike the shared beforeEach's maxBackups:3)
  // so nothing gets pruned — this test verifies multi-file reading, not
  // pruning (that's 'maxBackups caps the number of rotated files kept',
  // covered separately). Conflating the two made this test flaky against
  // its own fixture: with a low cap, most of the 20 entries are *supposed*
  // to be pruned away, which isn't a bug.
  const spanningAdapter = new LocalJsonAdapter({ dataDir: tmp, rotation: { maxSize: '300B', maxBackups: 100, compress: 'gzip', maxAge: '90d' } });
  const timestamps: string[] = [];
  for (let i = 0; i < 20; i++) {
    const ts = new Date(2026, 0, 1, 0, 0, i).toISOString();
    timestamps.push(ts);
    await spanningAdapter.appendLog(null, roleName, entry({ role: roleName, ts, action: `action-${i}` }));
  }
  await spanningAdapter.close();
  await delay(200);

  const fresh = new LocalJsonAdapter({ dataDir: tmp });
  try {
    const log = await fresh.loadAuditLog(null, roleName);
    assert.equal(log.length, 20);
    const sortedTs = [...log.map((e) => e.ts)];
    const expected = [...sortedTs].sort();
    assert.deepEqual(sortedTs, expected);
  } finally {
    await fresh.close();
  }
});

test('loadAuditLog since filter excludes earlier entries', async () => {
  const roleName = 'since-filter';
  const fresh = new LocalJsonAdapter({ dataDir: tmp });
  try {
    await fresh.appendLog(null, roleName, entry({ role: roleName, ts: '2026-01-01T00:00:00.000Z', action: 'old' }));
    await fresh.appendLog(null, roleName, entry({ role: roleName, ts: '2026-06-01T00:00:00.000Z', action: 'new' }));
    const log = await fresh.loadAuditLog(null, roleName, { since: '2026-03-01T00:00:00.000Z' });
    assert.equal(log.length, 1);
    assert.equal(log[0]?.action, 'new');
  } finally {
    await fresh.close();
  }
});

test('loadAuditLog skips a malformed line instead of failing the whole read', async () => {
  const roleName = 'corrupt';
  const fresh = new LocalJsonAdapter({ dataDir: tmp });
  try {
    await fresh.appendLog(null, roleName, entry({ role: roleName, action: 'good-1' }));
    await fresh.close();

    // Hand-corrupt the active log file by appending a garbage line.
    const { appendFile } = await import('node:fs/promises');
    const logPath = join(tmp, '_shared', 'logs', `${roleName}.jsonl`);
    await appendFile(logPath, 'not valid json at all\n');

    const reader = new LocalJsonAdapter({ dataDir: tmp });
    try {
      const log = await reader.loadAuditLog(null, roleName);
      assert.equal(log.length, 1);
      assert.equal(log[0]?.action, 'good-1');
    } finally {
      await reader.close();
    }
  } finally {
    // fresh already closed above
  }
});

test('loadAuditLog on a role with no log history returns an empty array, not a throw', async () => {
  const fresh = new LocalJsonAdapter({ dataDir: tmp });
  try {
    const log = await fresh.loadAuditLog(null, 'never-logged');
    assert.deepEqual(log, []);
  } finally {
    await fresh.close();
  }
});

test('rotation.maxSize accepts both "5MB" and "5M" spellings', async () => {
  const withMB = new LocalJsonAdapter({ dataDir: tmp, rotation: { maxSize: '5MB' } });
  const withM = new LocalJsonAdapter({ dataDir: tmp, rotation: { maxSize: '5M' } });
  try {
    // normalizeSize only runs when a stream is actually created — exercise both.
    await assert.doesNotReject(() => withMB.appendLog(null, 'unit-mb', entry({ role: 'unit-mb' })));
    await assert.doesNotReject(() => withM.appendLog(null, 'unit-m', entry({ role: 'unit-m' })));
  } finally {
    await withMB.close();
    await withM.close();
  }
});
