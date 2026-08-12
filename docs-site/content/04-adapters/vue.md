# Vue

`createRbacPlugin(client)` + `v-can` directive + `usePermission()` composable — `import ... from 'rbac-fs/vue'`. Same `a`/`I` naming as `rbac-fs/react`'s `<Can>` for a consistent mental model across frameworks.

## App setup (once)

```ts
import { createApp } from 'vue';
import { createRbacPlugin } from 'rbac-fs/vue';
import { RBACClient } from 'rbac-fs/client';
import App from './App.vue';

const client = new RBACClient(await fetch('/me/permissions').then((r) => r.json()));
createApp(App).use(createRbacPlugin(client)).mount('#app');
```

## Usage in a component

```vue
<script setup lang="ts">
import { usePermission } from 'rbac-fs/vue';

const props = defineProps<{ ownerId: string }>();
const can = usePermission();
</script>

<template>
  <!-- v-can toggles display:none (like v-show), not unmount -->
  <button v-can="{ a: 'invoice', I: 'approve' }">Approve invoice</button>

  <button v-can="{ a: 'expense-report', I: 'approve', context: { owner_id: props.ownerId } }">
    Approve my expense report
  </button>

  <p v-if="can('invoice', 'approve')">Allowed</p>
  <p v-else>Denied</p>
</template>
```

Full runnable version: [`examples/13-vue-usage.vue`](https://github.com/imchintoo/rbac-fs/blob/main/examples/13-vue-usage.vue) (paired with a headless `-verify.mjs` that exercises the same calls).

<div class="callout tip">Nuxt: no separate adapter needed — <code>rbac-fs/vue</code> works as-is on top of it, same SSR guidance as the React/Next.js adapter.</div>
