/**
 * 03 — Conditional (`when`) grants: "user can approve their OWN expense
 * report" instead of a blanket resource-level grant.
 * Run: node examples/03-conditional-grants.mjs
 *
 * v0.1's evaluator supports equality-only expressions: "<path> == <path|literal>",
 * resolved against `user.*` and the `context` object passed to can(). No
 * eval()/Function() involved — a hand-edited role file can't become a
 * code-execution vector.
 */
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });

await rbac.createRole(
  'employee',
  {
    conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
  },
  { force: true },
);

const alice = { id: 'alice', role: 'employee' };

// context carries the data needed to evaluate the `when` clause — here,
// who owns the specific report being acted on.
console.log('alice approving her own report:', await rbac.can(alice, 'expense-report', 'approve', { owner_id: 'alice' })); // true
console.log('alice approving someone else\'s report:', await rbac.can(alice, 'expense-report', 'approve', { owner_id: 'bob' })); // false

await rbac.close();
