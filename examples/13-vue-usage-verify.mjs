/**
 * Verification companion to 13-vue-usage.vue — exercises the exact same
 * createRbacPlugin/usePermission/v-can calls the SFC uses, headlessly (no
 * DOM/SFC compiler needed), against the real built adapter + client.
 * Run: node examples/13-vue-usage-verify.mjs
 */
import { createApp } from 'vue';
import { RBACClient } from 'rbac-fs/client';
import { createRbacPlugin, makeCanDirective, usePermission } from 'rbac-fs/vue';

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
});

// main.ts equivalent: createApp(App).use(createRbacPlugin(client))
const app = createApp({});
app.use(createRbacPlugin(client));

// Template: <p v-if="can(...)">...</p>
const can = app.runWithContext(() => usePermission());
console.log('can(invoice, approve):', can('invoice', 'approve')); // true
console.log('can(invoice, delete):', can('invoice', 'delete')); // false

// Template: <button v-can="{ a: 'invoice', I: 'approve' }">
const directive = makeCanDirective(client);
const approveBtn = { style: { display: '' } };
directive.mounted(approveBtn, { value: { a: 'invoice', I: 'approve' } });
console.log('approve button display (allowed):', JSON.stringify(approveBtn.style.display));

// Template: <button v-can="{ a: 'expense-report', I: 'approve', context: { owner_id } }">
const ownReportBtn = { style: { display: '' } };
directive.mounted(ownReportBtn, { value: { a: 'expense-report', I: 'approve', context: { owner_id: 'u1' } } });
console.log('own expense-report button display (allowed):', JSON.stringify(ownReportBtn.style.display));

const otherReportBtn = { style: { display: '' } };
directive.mounted(otherReportBtn, { value: { a: 'expense-report', I: 'approve', context: { owner_id: 'someone-else' } } });
console.log("someone else's expense-report button display (denied):", JSON.stringify(otherReportBtn.style.display));
