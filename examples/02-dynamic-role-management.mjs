/**
 * 02 — Dynamic role management: create/grant/revoke/list/delete at runtime.
 * Run: node examples/02-dynamic-role-management.mjs
 */
import { RBAC, RoleHasDependentsError } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });

await rbac.createRole('viewer', { permissions: [{ resource: 'invoice', actions: ['view'] }] }, { force: true });

// `inherits` pulls in everything the parent role can do, then this role's
// own `permissions` layer on top.
await rbac.createRole('supervisor', { inherits: ['viewer'] }, { force: true });

await rbac.grant('supervisor', { resource: 'invoice', actions: ['view', 'approve'] });
console.log('supervisor can approve (via grant):', await rbac.can({ id: 'u2', role: 'supervisor' }, 'invoice', 'approve')); // true
console.log('supervisor can view (via viewer inheritance):', await rbac.can({ id: 'u2', role: 'supervisor' }, 'invoice', 'view')); // true

await rbac.revoke('supervisor', { resource: 'invoice', actions: ['approve'] });
console.log('supervisor can approve after revoke:', await rbac.can({ id: 'u2', role: 'supervisor' }, 'invoice', 'approve')); // false

console.log(
  'all roles:',
  (await rbac.listRoles()).map((r) => r.name),
);

// deleteRole refuses to remove a role something else still `inherits` from,
// unless { force: true } — guards against silently breaking other roles.
try {
  await rbac.deleteRole('viewer');
} catch (err) {
  console.log('deleteRole blocked as expected:', err instanceof RoleHasDependentsError, err.message);
}

await rbac.deleteRole('supervisor');
await rbac.deleteRole('viewer'); // now safe — no more dependents
console.log('roles after cleanup:', (await rbac.listRoles()).map((r) => r.name));

await rbac.close();
