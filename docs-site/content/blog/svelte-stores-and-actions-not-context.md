---
title: "Svelte: explicit stores and actions, not context"
date: 2026-06-10
excerpt: rbac-fs's Svelte adapter closes over an explicit RBACClient instead of Svelte's context API — favoring traceability over implicit wiring.
tags: svelte, adapters
---

`rbac-fs/svelte` gives you two factory functions — `createPermissionStore(client)` and `createCanAction(client)` — both taking the client as an explicit argument rather than reaching for Svelte's `setContext`/`getContext`.

## The two primitives

```svelte
<script lang="ts">
  import { RBACClient } from 'rbac-fs/client';
  import { createCanAction, createPermissionStore } from 'rbac-fs/svelte';

  export let ownerId: string;

  // Fetch once at app init; share the client across components via a
  // module-level export or your own Svelte context, rather than
  // recreating it per-component.
  const client = new RBACClient(await fetch('/me/permissions').then((r) => r.json()));

  const permissions = createPermissionStore(client);
  const can = createCanAction(client);
</script>

<!-- use:can toggles display:none, same behavior as rbac-fs/vue's v-can -->
<button use:can={{ a: 'invoice', I: 'approve' }}>Approve invoice</button>

<button use:can={{ a: 'expense-report', I: 'approve', context: { owner_id: ownerId } }}>
  Approve my expense report
</button>

<!-- $permissions is the store's auto-subscribed value: client.can itself -->
<p>Imperative check: {$permissions('invoice', 'approve') ? 'allowed' : 'denied'}</p>
```

## Why not Svelte context

Svelte's context API is a natural fit for dependency injection across a component tree, and it's a reasonable choice — but it's implicit: a component using `getContext()` has no static, greppable link to where the value came from. `rbac-fs/svelte`'s factory functions take the client as a plain argument instead, which means the dependency is visible at every call site and traceable with a simple text search, at the cost of you (or your own thin wrapper) being responsible for sharing one `client` instance across components, typically via a module-level export.

## The store is literally `client.can`

`createPermissionStore(client)` wraps `client.can` in Svelte's store contract so `$permissions(...)` works with auto-subscription — it isn't reactive to anything changing over time (a `RBACClient`'s snapshot is immutable for its lifetime), it's a store purely so it's ergonomic to call from a template with the `$` prefix.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/angular-rbaccan-real-unmount-like-ngif.html">How this compares to Angular's *rbacCan and Vue's v-can →</a></div>

For a runnable, headless verification, see [Tutorial: verifying the Svelte adapter headlessly](/blog/tutorial-svelte-adapter-headless-verify.html).
