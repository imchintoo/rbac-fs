/**
 * 01 — Quickstart: the smallest possible rbac-fs setup.
 *
 * Run: node examples/01-quickstart.mjs
 *
 * On first run this creates `.rbac/_shared/roles/manager.json` on disk —
 * that file becomes the reviewable source of truth from then on. Delete
 * `.rbac/` and re-run to see it get created again.
 */
import { RBAC } from 'rbac-fs';

const rbac = new RBAC(); // no tenantId -> uses .rbac/_shared/

// { force: true } makes this idempotent across repeated runs of this demo.
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve', 'view'] }] }, { force: true });

const user = { id: 'u1', role: 'manager' };

console.log('manager can approve invoice:', await rbac.can(user, 'invoice', 'approve')); // true
console.log('manager can delete invoice:', await rbac.can(user, 'invoice', 'delete')); // false

// Always close() before process exit — releases the chokidar file watcher
// (live-reload, v0.5) and the audit-log write stream (v0.3) so the event
// loop doesn't hang.
await rbac.close();
