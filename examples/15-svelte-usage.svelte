<!--
  15 — Svelte: createPermissionStore(client) ($permissions(...)) +
  createCanAction(client) (use:can). Both are factory functions closing
  over an explicit client rather than Svelte context — see
  src/adapters/svelte/index.ts for why.

  This is idiomatic app code — copy it into a real Svelte project (Vite +
  @sveltejs/vite-plugin-svelte, or SvelteKit). `15-svelte-usage-verify.mjs`
  next to this file exercises the exact same store/action calls headlessly
  to verify they behave as documented.
-->
<script lang="ts">
  import { RBACClient } from 'rbac-fs/client';
  import { createCanAction, createPermissionStore } from 'rbac-fs/svelte';

  export let ownerId: string;

  // In a real app, fetch this snapshot from your backend once at app init
  // and share the client (module-level export, or a Svelte context) across
  // components instead of recreating it per-component.
  const client = new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
  });

  const permissions = createPermissionStore(client);
  const can = createCanAction(client);
</script>

<!-- use:can toggles display:none (like rbac-fs/vue's v-can), not unmount -->
<button use:can={{ a: 'invoice', I: 'approve' }}>Approve invoice</button>

<button use:can={{ a: 'expense-report', I: 'approve', context: { owner_id: ownerId } }}>Approve my expense report</button>

<!-- $permissions is the store's auto-subscribed value: client.can itself -->
<p>Imperative check: {$permissions('invoice', 'approve') ? 'allowed' : 'denied'}</p>
