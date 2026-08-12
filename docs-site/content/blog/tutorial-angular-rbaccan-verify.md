---
title: "Tutorial: verifying *rbacCan, no compiler needed"
date: 2026-06-12
excerpt: A runnable walkthrough that drives RbacService and RbacCanDirective directly with a fake ViewContainerRef — the same approach the adapter's own test suite uses.
tags: angular, tutorial
---

Real Angular `@Component` decorators need the Angular compiler (JIT or AOT, wired in via `@angular/cli`'s builder) to process templates and DI metadata — plain `tsx`-transpiled decorators aren't enough. So this verification drives the service and directive directly, exactly like `test/angular-adapter.test.ts` does.

## Set up the client and service

```ts
import { RBACClient } from 'rbac-fs/client';
import { RbacService } from 'rbac-fs/angular';

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
});

const service = new RbacService(client); // what @Inject(RBAC_CLIENT) wires up for you in a real app

console.log(service.can('invoice', 'approve')); // true
console.log(service.can('invoice', 'delete'));  // false
```

## A fake ViewContainerRef to observe mount/unmount calls

```ts
function makeViewContainer() {
  const vc = {
    createCalls: 0,
    clearCalls: 0,
    createEmbeddedView() { vc.createCalls += 1; return {}; },
    clear() { vc.clearCalls += 1; },
  };
  return vc;
}
```

## Drive the directive through three scenarios

```ts
import { RbacCanDirective } from 'rbac-fs/angular';

// invoice:approve -> should mount
const approveVc = makeViewContainer();
const approveDirective = new RbacCanDirective({}, approveVc, service);
approveDirective.rbacCan = 'invoice';
approveDirective.rbacCanAction = 'approve';
approveDirective.ngOnChanges();
console.log(approveVc.createCalls === 1); // true

// own expense-report (context matches) -> should mount
const ownVc = makeViewContainer();
const ownDirective = new RbacCanDirective({}, ownVc, service);
ownDirective.rbacCan = 'expense-report';
ownDirective.rbacCanAction = 'approve';
ownDirective.rbacCanContext = { owner_id: 'u1' };
ownDirective.ngOnChanges();
console.log(ownVc.createCalls === 1); // true

// someone else's expense-report (context doesn't match) -> should NOT mount
const otherVc = makeViewContainer();
const otherDirective = new RbacCanDirective({}, otherVc, service);
otherDirective.rbacCan = 'expense-report';
otherDirective.rbacCanAction = 'approve';
otherDirective.rbacCanContext = { owner_id: 'someone-else' };
otherDirective.ngOnChanges();
console.log(otherVc.createCalls === 0, otherVc.clearCalls === 1); // true, true
```

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html">Full adapter API reference →</a></div>

Verified against [`examples/14-angular-usage.ts`](https://github.com/imchintoo/rbac-fs/blob/main/examples/14-angular-usage.ts), runnable with `node --import tsx`.
