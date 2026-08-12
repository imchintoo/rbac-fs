/**
 * Verification companion to 15-svelte-usage.svelte — exercises the exact
 * same createPermissionStore/createCanAction calls the component uses,
 * headlessly (no Svelte compiler needed), against the real built adapter
 * + client.
 * Run: node examples/15-svelte-usage-verify.mjs
 */
import { RBACClient } from 'rbac-fs/client';
import { createCanAction, createPermissionStore } from 'rbac-fs/svelte';

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
});

// Template: {$permissions('invoice', 'approve') ? 'allowed' : 'denied'}
const permissions = createPermissionStore(client);
permissions.subscribe((can) => {
  console.log('$permissions(invoice, approve):', can('invoice', 'approve')); // true
  console.log('$permissions(invoice, delete):', can('invoice', 'delete')); // false
});

// Template: use:can={{ a: 'invoice', I: 'approve' }}
const can = createCanAction(client);
const approveBtn = { style: { display: '' } };
can(approveBtn, { a: 'invoice', I: 'approve' });
console.log('approve button display (allowed):', JSON.stringify(approveBtn.style.display));

// Template: use:can={{ a: 'expense-report', I: 'approve', context: { owner_id } }}
const ownReportBtn = { style: { display: '' } };
can(ownReportBtn, { a: 'expense-report', I: 'approve', context: { owner_id: 'u1' } });
console.log('own expense-report button display (allowed):', JSON.stringify(ownReportBtn.style.display));

const otherReportBtn = { style: { display: '' } };
can(otherReportBtn, { a: 'expense-report', I: 'approve', context: { owner_id: 'someone-else' } });
console.log("someone else's expense-report button display (denied):", JSON.stringify(otherReportBtn.style.display));
