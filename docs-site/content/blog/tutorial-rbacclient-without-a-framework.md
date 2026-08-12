---
title: "Tutorial: RBACClient without a framework"
date: 2026-07-14
excerpt: A vanilla-JS walkthrough of RBACClient — useful on its own, and as the mental model underneath every rbac-fs frontend framework adapter.
tags: browser-client, tutorial
---

Every frontend adapter — React, Vue, Angular, Svelte — is a thin wrapper around `RBACClient`. This tutorial skips the framework layer entirely, so the underlying model is clear before you add one back.

## Build a snapshot (normally your backend does this)

```js
const snapshot = {
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
};
```

In a real app, this comes from a backend endpoint (`GET /me/permissions`) that already ran the Node `RBAC.can()`-equivalent resolution server-side and returned just the flattened result — the browser never sees raw role definitions.

## Construct the client and check permissions

```js
import { RBACClient } from 'rbac-fs/client';

const client = new RBACClient(snapshot);

client.can('invoice', 'approve');                                  // true
client.can('expense-report', 'approve', { owner_id: 'u1' });        // true — matches user.id
client.can('expense-report', 'approve', { owner_id: 'someone-else' }); // false
```

## Wire it into plain DOM manipulation

```js
function renderApproveButton(container) {
  if (client.can('invoice', 'approve')) {
    const btn = document.createElement('button');
    btn.textContent = 'Approve invoice';
    container.appendChild(btn);
  } else {
    container.textContent = "You can't approve invoices";
  }
}
```

This is exactly the pattern `rbac-fs/react`'s `<Can>` component wraps for you declaratively — worth seeing the manual version once so the framework adapter later feels like a convenience, not magic.

## Custom operators work here too

```js
const client = new RBACClient(snapshot, {
  operators: {
    withinBusinessHours: ({ context }) => {
      const hour = new Date(context.now).getHours();
      return hour >= 9 && hour < 17;
    },
  },
});
```

Same `operators` option as the Node `RBAC` constructor — register a real function, referenced by name from a `condition`'s `{ op: 'custom', name: 'withinBusinessHours' }`. This is how you'd express a rule like "can only approve during business hours" entirely client-side, without a network round-trip per check.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/quick-start.html">Back to the Node-side Quick Start →</a></div>

Verified against README.md's browser-usage documentation and `docs/PLAN.md` §7's snapshot API specification — the same public surface every framework adapter builds on.
