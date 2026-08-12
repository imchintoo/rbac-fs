# Svelte

`createPermissionStore(client)` (`$permissions(...)`) + `createCanAction(client)` (`use:can`) — `import ... from 'rbac-fs/svelte'`. Both are factory functions that close over an explicit client rather than Svelte context.

## Usage

```svelte
<script lang="ts">
  import { RBACClient } from 'rbac-fs/client';
  import { createCanAction, createPermissionStore } from 'rbac-fs/svelte';

  export let ownerId: string;

  // Fetch this snapshot from your backend once at app init in a real app,
  // and share the client across components (module export or Svelte context)
  // instead of recreating it per-component.
  const client = new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
  });

  const permissions = createPermissionStore(client);
  const can = createCanAction(client);
</script>

<!-- use:can toggles display:none, like rbac-fs/vue's v-can, not unmount -->
<button use:can={{ a: 'invoice', I: 'approve' }}>Approve invoice</button>

<button use:can={{ a: 'expense-report', I: 'approve', context: { owner_id: ownerId } }}>
  Approve my expense report
</button>

<!-- $permissions is the store's auto-subscribed value: client.can itself -->
<p>{$permissions('invoice', 'approve') ? 'Allowed' : 'Denied'}</p>
```

Full runnable version: [`examples/15-svelte-usage.svelte`](https://github.com/imchintoo/rbac-fs/blob/main/examples/15-svelte-usage.svelte) (paired with a headless `-verify.mjs` that exercises the same store/action calls). Works with plain Vite + `@sveltejs/vite-plugin-svelte`, or SvelteKit.
