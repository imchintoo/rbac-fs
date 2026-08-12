---
title: "Tutorial: verifying the Vue adapter headlessly"
date: 2026-06-16
excerpt: A runnable, no-browser walkthrough of rbac-fs's Vue plugin, v-can directive, and usePermission() composable using the same verification approach as its test suite.
tags: vue, tutorial
---

This is the same headless-verification pattern used across every rbac-fs frontend adapter — no Vite dev server, just the composable and directive driven directly.

## The component

```vue
<script setup lang="ts">
import { usePermission } from 'rbac-fs/vue';

const props = defineProps<{ ownerId: string }>();
const can = usePermission();
</script>

<template>
  <button v-can="{ a: 'invoice', I: 'approve' }">Approve invoice</button>

  <button v-can="{ a: 'expense-report', I: 'approve', context: { owner_id: props.ownerId } }">
    Approve my expense report
  </button>

  <p v-if="can('invoice', 'approve')">Imperative check: allowed</p>
  <p v-else>Imperative check: denied</p>
</template>
```

## Set up the client and plugin for a test

```ts
import { createApp } from 'vue';
import { createRbacPlugin } from 'rbac-fs/vue';
import { RBACClient } from 'rbac-fs/client';

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
});

const app = createApp(YourComponent, { ownerId: 'u1' });
app.use(createRbacPlugin(client));
```

## What to assert

With this client and `ownerId: 'u1'`, the "Approve invoice" button renders visible (not `display:none`), the "Approve my expense report" button also renders visible (the condition matches `owner_id == user.id`), and the imperative paragraph shows "allowed." Swap `ownerId` to a value that doesn't match `user.id`, or swap the client for one built from a permissions array that doesn't include `invoice:approve`, and re-render — both should flip to their denied states, proving the directive and composable read from the same underlying `client.can()` evaluation rather than diverging logic.

<div class="related-link"><span class="related-label">Related</span><a href="/blog/vue-v-can-directive-display-none-vs-unmount.html">Why v-can hides instead of unmounting →</a></div>

Verified against [`examples/13-vue-usage.vue`](https://github.com/imchintoo/rbac-fs/blob/main/examples/13-vue-usage.vue) and its headless counterpart `examples/13-vue-usage-verify.mjs`.
