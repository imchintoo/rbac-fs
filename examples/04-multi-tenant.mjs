/**
 * 04 — Multi-tenant isolation: same role name, completely separate files
 * and permissions per tenant, plus cross-tenant `_shared/` roles.
 * Run: node examples/04-multi-tenant.mjs
 */
import { RBAC } from 'rbac-fs';

const acme = new RBAC({ tenantId: 'acme-corp' });
const globex = new RBAC({ tenantId: 'globex-inc' });
const platform = new RBAC(); // no tenantId -> _shared/, e.g. for platform-level staff

await acme.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });
await globex.createRole('manager', { permissions: [{ resource: 'ledger', actions: ['approve'] }] }, { force: true });
await platform.createRole('support-agent', { permissions: [{ resource: 'tenant', actions: ['impersonate'] }] }, { force: true });

// .rbac/tenants/acme-corp/roles/manager.json  and
// .rbac/tenants/globex-inc/roles/manager.json are two entirely separate files.
console.log('acme manager -> invoice.approve:', await acme.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve')); // true
console.log('acme manager -> ledger.approve (globex-only permission):', await acme.can({ id: 'u1', role: 'manager' }, 'ledger', 'approve')); // false
console.log('globex manager -> ledger.approve:', await globex.can({ id: 'u1', role: 'manager' }, 'ledger', 'approve')); // true

// tenantId is sanitized against ^[a-zA-Z0-9_-]+$ before touching the
// filesystem — path-traversal attempts throw InvalidIdentifierError.
try {
  new RBAC({ tenantId: '../../etc' });
} catch (err) {
  console.log('path traversal rejected as expected:', err.name, '-', err.message);
}

await acme.close();
await globex.close();
await platform.close();
