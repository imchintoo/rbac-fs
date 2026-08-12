/**
 * 05 — Audit logging + rotation: every can() call is recorded to
 * `logs/<role>.jsonl`, one allow/deny decision per line.
 * Run: node examples/05-audit-logging.mjs
 */
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({
  tenantId: 'acme-corp',
  rotation: {
    maxSize: '5MB', // rotate the active log once it reaches this size
    maxAge: '90d', // delete rotated files older than this
    compress: 'gzip', // compress rotated files
    maxBackups: 12, // keep at most this many rotated files per role
  },
});

await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });

await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve'); // allow
await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'delete'); // deny

const entries = await rbac.getAuditLog('manager');
console.log(`recorded ${entries.length} audit entries (most recent first two shown):`);
console.log(entries.slice(-2));

// Filter to entries at/after a point in time.
const today = new Date().toISOString().slice(0, 10);
const todaysEntries = await rbac.getAuditLog('manager', { since: today });
console.log(`entries since ${today}:`, todaysEntries.length);

await rbac.close();
