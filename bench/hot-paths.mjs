/**
 * Micro-benchmark for rbac-fs's hottest per-`can()`-call paths. Pure JS,
 * no build step — `node bench/hot-paths.mjs` / `npm run bench`.
 *
 * Each section reimplements the "old" (pre-optimization) shape of the real
 * code next to the current implementation so the comparison stays
 * self-contained and doesn't drift out of sync with a git ref. See
 * docs/backlog/lessons.md's 2026-08-12 entries for the refactor this
 * benchmark was written to justify.
 */

// ---- permission lookup: linear scan vs resource-indexed Map ----

function buildRole(numResources, permsPerResource) {
  const permissions = [];
  for (let r = 0; r < numResources; r++) {
    for (let p = 0; p < permsPerResource; p++) {
      permissions.push({ resource: `resource-${r}`, actions: [`action-${p}`] });
    }
  }
  return permissions;
}

function hasUnconditionalGrant_linearScan(permissions, resource, action) {
  return permissions.some((permission) => permission.resource === resource && permission.actions.includes(action));
}

function indexByResource(entries) {
  const index = new Map();
  for (const entry of entries) {
    const bucket = index.get(entry.resource);
    if (bucket) bucket.push(entry);
    else index.set(entry.resource, [entry]);
  }
  return index;
}

function hasUnconditionalGrant_indexed(index, resource, action) {
  const candidates = index.get(resource);
  return candidates !== undefined && candidates.some((permission) => permission.actions.includes(action));
}

function bench(label, fn, iterations) {
  for (let i = 0; i < Math.min(1000, iterations); i++) fn(); // warmup
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`${label.padEnd(48)} ${ms.toFixed(2).padStart(10)} ms  (${((ms / iterations) * 1000).toFixed(1)} us/op)`);
  return ms;
}

console.log('=== Permission lookup: role with 50 resources x 10 perms = 500 grants ===');
const permissions = buildRole(50, 10);
const index = indexByResource(permissions);
const ITER = 200_000;
const msScanWorst = bench('linear scan (resource is last)', () => hasUnconditionalGrant_linearScan(permissions, 'resource-49', 'action-9'), ITER);
const msIndexWorst = bench('resource-indexed Map lookup', () => hasUnconditionalGrant_indexed(index, 'resource-49', 'action-9'), ITER);
console.log(`  -> ${(msScanWorst / msIndexWorst).toFixed(1)}x faster (realistic case: many resources, lookup not near the front)\n`);

console.log('=== Same, but the looked-up resource is FIRST (best case for a linear scan) ===');
const msScanBest = bench('linear scan (resource is first)', () => hasUnconditionalGrant_linearScan(permissions, 'resource-0', 'action-0'), ITER);
const msIndexBest = bench('resource-indexed Map lookup', () => hasUnconditionalGrant_indexed(index, 'resource-0', 'action-0'), ITER);
console.log(`  -> ${(msScanBest / msIndexBest).toFixed(1)}x (indexed lookup has flat cost regardless of position — a scan doesn't)\n`);

// ---- numeric comparison: sequential if-chain vs dispatch table ----

const NUMERIC_COMPARATORS = { gt: (l, r) => l > r, gte: (l, r) => l >= r, lt: (l, r) => l < r, lte: (l, r) => l <= r };

function evaluateNumeric_ifChain(op, left, right) {
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  if (op === 'gt') return left > right;
  if (op === 'gte') return left >= right;
  if (op === 'lt') return left < right;
  return left <= right;
}
function evaluateNumeric_dispatchTable(op, left, right) {
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return NUMERIC_COMPARATORS[op](left, right);
}

console.log('=== Numeric comparison dispatch ("lte" — worst case for the old if-chain) ===');
const ITER2 = 2_000_000;
const nOld = bench('sequential if-chain', () => evaluateNumeric_ifChain('lte', 3, 5), ITER2);
const nNew = bench('dispatch table', () => evaluateNumeric_dispatchTable('lte', 3, 5), ITER2);
console.log(`  -> ${(nOld / nNew).toFixed(2)}x — mostly a cyclomatic-complexity/readability win, not raw speed (V8 JITs both fine)\n`);

// ---- I/O concurrency: sequential vs Promise.all over real files ----

const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');

const dir = await mkdtemp(join(tmpdir(), 'rbac-bench-'));
const FILE_COUNT = 60;
const files = [];
for (let i = 0; i < FILE_COUNT; i++) {
  const p = join(dir, `role-${i}.json`);
  await writeFile(p, JSON.stringify({ name: `role-${i}`, permissions: [] }));
  files.push(p);
}

async function readSequential() {
  const roles = [];
  for (const f of files) roles.push(JSON.parse(await readFile(f, 'utf-8')));
  return roles;
}
async function readParallel() {
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(f, 'utf-8'))));
}

async function benchAsync(label, fn, iterations) {
  for (let i = 0; i < 3; i++) await fn(); // warmup
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) await fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`${label.padEnd(48)} ${ms.toFixed(2).padStart(10)} ms  (${(ms / iterations).toFixed(2)} ms/op, ${FILE_COUNT} files)`);
  return ms;
}

console.log(`=== loadAllRoles-style I/O: ${FILE_COUNT} role files ===`);
const seqMs = await benchAsync('sequential await in a for-loop', readSequential, 50);
const parMs = await benchAsync('Promise.all (concurrent)', readParallel, 50);
console.log(`  -> ${(seqMs / parMs).toFixed(2)}x faster wall-clock for ${FILE_COUNT} files\n`);

await rm(dir, { recursive: true, force: true });
