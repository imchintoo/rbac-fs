/**
 * 14 — Angular: provideRbacClient() + RbacService + *rbacCan structural
 * directive. Unlike Vue's v-can (display:none), *rbacCan does a real
 * DOM unmount/remount via ViewContainerRef — the same public API *ngIf
 * itself is built on.
 *
 * Run: node --import tsx examples/14-angular-usage.ts
 *
 * NOTE on why this file doesn't declare a real @Component: Angular's own
 * decorators need the Angular compiler (JIT or AOT, wired in by
 * @angular/cli's builder) to process templates/DI metadata — plain
 * esbuild-transpiled decorators (what `tsx` uses) aren't enough (Angular
 * itself throws "Standard Angular field decorators are not supported in
 * JIT mode" outside that pipeline). See the "Real app wiring" block below
 * for the copy-pasteable component — verification here drives
 * RbacService/RbacCanDirective directly, the same approach
 * test/angular-adapter.test.ts uses to keep this adapter's test suite green.
 */
import { RBACClient } from 'rbac-fs/client';
import { provideRbacClient, RbacCanDirective, RbacService } from 'rbac-fs/angular';

/* ---------------------------------------------------------------------------
 * Real app wiring — copy this into your Angular project as-is:
 *
 *   import { Component, Input } from '@angular/core';
 *   import { RbacCanDirective, RbacService } from 'rbac-fs/angular';
 *
 *   @Component({
 *     standalone: true,
 *     imports: [RbacCanDirective],
 *     selector: 'invoice-actions',
 *     template: `
 *       <button *rbacCan="'invoice'; action: 'approve'">Approve invoice</button>
 *
 *       <button *rbacCan="'expense-report'; action: 'approve'; context: reportContext">
 *         Approve my expense report
 *       </button>
 *
 *       <p>Imperative check: {{ rbac.can('invoice', 'approve') ? 'allowed' : 'denied' }}</p>
 *     `,
 *   })
 *   export class InvoiceActionsComponent {
 *     @Input() ownerId = '';
 *     get reportContext() {
 *       return { owner_id: this.ownerId };
 *     }
 *     constructor(public rbac: RbacService) {}
 *   }
 *
 *   // main.ts
 *   bootstrapApplication(AppComponent, {
 *     providers: [provideRbacClient(new RBACClient(await fetch('/me/permissions').then((r) => r.json())))],
 *   });
 * ------------------------------------------------------------------------- */

// --- Verification: drive the real service + directive directly -----------

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
});

console.log('provideRbacClient() provider for bootstrapApplication({ providers: [...] }):', provideRbacClient(client));

const service = new RbacService(client); // what @Inject(RBAC_CLIENT) wires up for you in a real app
console.log('RbacService.can(invoice, approve):', service.can('invoice', 'approve'));
console.log('RbacService.can(invoice, delete):', service.can('invoice', 'delete'));

function makeViewContainer() {
  const vc = {
    createCalls: 0,
    clearCalls: 0,
    createEmbeddedView() {
      vc.createCalls += 1;
      return {} as never;
    },
    clear() {
      vc.clearCalls += 1;
    },
  };
  return vc;
}
const fakeTemplateRef = {} as never;

// Template: *rbacCan="'invoice'; action: 'approve'"
const approveVc = makeViewContainer();
const approveDirective = new RbacCanDirective(fakeTemplateRef, approveVc as never, service);
approveDirective.rbacCan = 'invoice';
approveDirective.rbacCanAction = 'approve';
approveDirective.ngOnChanges();
console.log('*rbacCan="invoice; action: approve" -> view created:', approveVc.createCalls === 1);

// Template: *rbacCan="'expense-report'; action: 'approve'; context: reportContext" (own report)
const ownReportVc = makeViewContainer();
const ownReportDirective = new RbacCanDirective(fakeTemplateRef, ownReportVc as never, service);
ownReportDirective.rbacCan = 'expense-report';
ownReportDirective.rbacCanAction = 'approve';
ownReportDirective.rbacCanContext = { owner_id: 'u1' };
ownReportDirective.ngOnChanges();
console.log('own expense-report -> view created:', ownReportVc.createCalls === 1);

// Same directive, someone else's report
const otherReportVc = makeViewContainer();
const otherReportDirective = new RbacCanDirective(fakeTemplateRef, otherReportVc as never, service);
otherReportDirective.rbacCan = 'expense-report';
otherReportDirective.rbacCanAction = 'approve';
otherReportDirective.rbacCanContext = { owner_id: 'someone-else' };
otherReportDirective.ngOnChanges();
console.log("someone else's expense-report -> view created:", otherReportVc.createCalls === 1);
