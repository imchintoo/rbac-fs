---
title: "Angular's *rbacCan: real unmount, not hide"
date: 2026-06-14
excerpt: rbac-fs's Angular adapter does a real ViewContainerRef unmount/remount, matching *ngIf's own public API instead of a display:none toggle.
tags: angular, adapters
---

`rbac-fs/angular` gives you `provideRbacClient()`, `RbacService`, and a structural directive, `*rbacCan`. Structural — meaning it controls whether an element exists in the DOM at all, the same category of directive as `*ngIf`.

## Setup

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { RBACClient } from 'rbac-fs/client';
import { provideRbacClient } from 'rbac-fs/angular';

bootstrapApplication(AppComponent, {
  providers: [provideRbacClient(new RBACClient(await fetch('/me/permissions').then((r) => r.json())))],
});
```

## The directive

```ts
@Component({
  standalone: true,
  imports: [RbacCanDirective],
  selector: 'invoice-actions',
  template: `
    <button *rbacCan="'invoice'; action: 'approve'">Approve invoice</button>

    <button *rbacCan="'expense-report'; action: 'approve'; context: reportContext">
      Approve my expense report
    </button>

    <p>Imperative check: {{ rbac.can('invoice', 'approve') ? 'allowed' : 'denied' }}</p>
  `,
})
export class InvoiceActionsComponent {
  @Input() ownerId = '';
  get reportContext() { return { owner_id: this.ownerId }; }
  constructor(public rbac: RbacService) {}
}
```

## Why real unmount, not display:none

`*rbacCan` is built on `ViewContainerRef` — `createEmbeddedView()` when the check passes, `clear()` when it doesn't — the exact same public API Angular's own `*ngIf` is built on. Unlike Vue's `v-can` (which toggles `display:none` deliberately, to mirror `v-show`), Angular's structural-directive convention is unmount, not hide, and `rbac-fs` follows that convention rather than introducing a second, non-idiomatic behavior into an Angular codebase. Practical effect: an element gated by `*rbacCan` that fails the check has its component lifecycle hooks (`ngOnDestroy`, etc.) actually fire — it's genuinely gone, not just invisible.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/vue-v-can-directive-display-none-vs-unmount.html">Compare with Vue's v-can (display:none by design) →</a></div>

For a runnable walkthrough driving `RbacService` and `RbacCanDirective` directly, see [Tutorial: verifying the Angular adapter without the Angular compiler](/blog/tutorial-angular-rbaccan-verify.html).
