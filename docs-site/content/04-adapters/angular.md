# Angular

`provideRbacClient()` + `RbacService` + `*rbacCan` structural directive — `import ... from 'rbac-fs/angular'`. Unlike Vue's `v-can` (`display:none`), `*rbacCan` does a real DOM unmount/remount via `ViewContainerRef` — the same primitive `*ngIf` itself is built on.

## App setup (once)

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRbacClient } from 'rbac-fs/angular';
import { RBACClient } from 'rbac-fs/client';

bootstrapApplication(AppComponent, {
  providers: [provideRbacClient(new RBACClient(await fetch('/me/permissions').then((r) => r.json())))],
});
```

## Usage in a component

```ts
import { Component, Input } from '@angular/core';
import { RbacCanDirective, RbacService } from 'rbac-fs/angular';

@Component({
  standalone: true,
  imports: [RbacCanDirective],
  selector: 'invoice-actions',
  template: `
    <button *rbacCan="'invoice'; action: 'approve'">Approve invoice</button>

    <button *rbacCan="'expense-report'; action: 'approve'; context: reportContext">
      Approve my expense report
    </button>

    <p>{{ rbac.can('invoice', 'approve') ? 'Allowed' : 'Denied' }}</p>
  `,
})
export class InvoiceActionsComponent {
  @Input() ownerId = '';
  get reportContext() {
    return { owner_id: this.ownerId };
  }
  constructor(public rbac: RbacService) {}
}
```

Full runnable verification (drives `RbacService`/`RbacCanDirective` directly, same approach this package's own adapter tests use): [`examples/14-angular-usage.ts`](https://github.com/imchintoo/rbac-fs/blob/main/examples/14-angular-usage.ts).
