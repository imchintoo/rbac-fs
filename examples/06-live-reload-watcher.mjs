/**
 * 06 — Live-reload: role files are cached in memory for fast can() checks,
 * and a chokidar-backed watcher invalidates the cache when a role file is
 * hand-edited on disk — no process restart needed.
 * Run: node examples/06-live-reload-watcher.mjs
 */
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['view'] }] }, { force: true });

const user = { id: 'u1', role: 'manager' };
console.log('before hand-edit, can approve:', await rbac.can(user, 'invoice', 'approve')); // false

// Simulate a human hand-editing the role file directly on disk (e.g. via a
// PR merge) instead of calling grant() — this is the "git-friendly" part
// of rbac-fs: the file IS the source of truth.
const roleFile = '.rbac/tenants/acme-corp/roles/manager.json';
const current = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(roleFile, 'utf8')));
current.permissions[0].actions.push('approve');
await writeFile(roleFile, JSON.stringify(current, null, 2));

// Give chokidar a moment to pick up the fs event and invalidate the cache.
await sleep(300);

console.log('after hand-edit, can approve:', await rbac.can(user, 'invoice', 'approve')); // true, no restart needed

await rbac.close();
