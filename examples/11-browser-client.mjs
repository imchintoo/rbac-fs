/**
 * 11 — Browser client: the Node package never ships to a browser bundle.
 * Instead your backend resolves permissions server-side (via RBAC.can() /
 * listRoles()) and sends an already-flattened snapshot to the browser,
 * where RBACClient.can() checks it synchronously, in-memory, with zero
 * filesystem or network access.
 * Run: node examples/11-browser-client.mjs   (works in any JS runtime, not just Node)
 */
import { RBACClient } from 'rbac-fs/client';

// This is the shape your backend endpoint (e.g. GET /me/permissions) would
// return after resolving the logged-in user's role server-side with the
// real `RBAC` class — see docs/PLAN.md §7.
const snapshotFromYourApi = {
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['view'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
};

const client = new RBACClient(snapshotFromYourApi);

console.log('can view invoice:', client.can('invoice', 'view')); // true, synchronous, no await
console.log('can delete invoice:', client.can('invoice', 'delete')); // false
console.log('can approve own expense report:', client.can('expense-report', 'approve', { owner_id: 'u1' })); // true
console.log('can approve someone else\'s expense report:', client.can('expense-report', 'approve', { owner_id: 'someone-else' })); // false

// No close() — RBACClient holds no OS resources (no file watchers, no log
// streams), unlike the Node RBAC class.
