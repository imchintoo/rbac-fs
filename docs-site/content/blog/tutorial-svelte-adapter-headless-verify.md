---
title: "Tutorial: verifying the Svelte adapter headlessly"
date: 2026-06-08
excerpt: A runnable, no-browser walkthrough of createPermissionStore and createCanAction — the store and action primitives underneath rbac-fs's Svelte adapter.
tags: svelte, tutorial
---

Same pattern as every other frontend adapter in this series: drive the real primitives directly, no dev server needed.

## The component

```svelte
<script lang="ts">
  import { RBACClient } from 'rbac-fs/client';
  import { createCanAction, createPermissionStore } from 'rbac-fs/svelte';

  export let ownerId: string;

  const client = new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
  });

  const permissions = createPermissionStore(client);
  const can = createCanAction(client);
</script>

<button use:can={{ a: 'invoice', I: 'approve' }}>Approve invoice</button>
<button use:can={{ a: 'expense-report', I: 'approve', context: { owner_id: ownerId } }}>
  Approve my expense report
</button>
<p>Imperative check: {$permissions('invoice', 'approve') ? 'allowed' : 'denied'}</p>
```

## Verify the store directly

```ts
import { get } from 'svelte/store';

console.log(get(permissions)('invoice', 'approve')); // true — same as client.can('invoice', 'approve')
```

`get(permissions)` returns the store's current value, which is `client.can` itself — calling it is identical to calling `client.can` directly, so this line is really just confirming the store wrapper didn't change the underlying function's behavior.

## Verify the action directly

```ts
function makeNode() {
  return { style: { display: '' } };
}

const node = makeNode();
const action = can(node, { a: 'invoice', I: 'approve' });
console.log(node.style.display); // '' — visible, permission granted

const deniedNode = makeNode();
can(deniedNode, { a: 'invoice', I: 'delete' }); // no delete permission on this client
console.log(deniedNode.style.display); // 'none'

action.destroy?.(); // Svelte calls this automatically when the element unmounts
```

`use:can` follows Svelte's action contract (a function receiving the node and params, optionally returning `update`/`destroy`), which is how it's able to toggle `display: none` on the actual DOM node without any framework-level reactivity beyond what Svelte already provides for actions.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/svelte-stores-and-actions-not-context.html">Why the adapter uses explicit stores/actions instead of context →</a></div>

Verified against [`examples/15-svelte-usage.svelte`](https://github.com/imchintoo/rbac-fs/blob/main/examples/15-svelte-usage.svelte) and its headless counterpart `examples/15-svelte-usage-verify.mjs`.
