<!--
  13 — Vue 3: createRbacPlugin(client) + v-can directive + usePermission()
  composable. Naming (`a`/`I`) matches rbac-fs/react's <Can> for a
  consistent mental model across frameworks.

  This is idiomatic app code — copy it into a real Vue 3 SFC project
  (Vite, Nuxt, vue-cli). `main.ts` below shows the one-time plugin install;
  `13-vue-usage.mjs` next to this file exercises the exact same
  directive/composable calls headlessly to verify they behave as documented.
-->
<script setup lang="ts">
import { usePermission } from 'rbac-fs/vue';

const props = defineProps<{ ownerId: string }>();
const can = usePermission(); // imperative check, e.g. for v-if or form logic
</script>

<template>
  <!-- v-can toggles display:none (like v-show) rather than unmounting -->
  <button v-can="{ a: 'invoice', I: 'approve' }">Approve invoice</button>

  <button v-can="{ a: 'expense-report', I: 'approve', context: { owner_id: props.ownerId } }">Approve my expense report</button>

  <!-- true unmount instead of display:none -->
  <p v-if="can('invoice', 'approve')">Imperative check: allowed</p>
  <p v-else>Imperative check: denied</p>
</template>

<!--
  main.ts — one-time app setup:

  import { createApp } from 'vue';
  import { createRbacPlugin } from 'rbac-fs/vue';
  import { RBACClient } from 'rbac-fs/client';
  import App from './App.vue';

  const client = new RBACClient(await fetch('/me/permissions').then((r) => r.json()));
  createApp(App).use(createRbacPlugin(client)).mount('#app');
-->
