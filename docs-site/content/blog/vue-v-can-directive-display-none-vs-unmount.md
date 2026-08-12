---
title: "Vue's v-can directive: why it hides, not unmounts"
date: 2026-06-18
excerpt: rbac-fs's v-can directive toggles display:none like v-show — a deliberate choice, different from the true unmount you get from rbac-fs's Angular and React adapters.
tags: vue, adapters
---

`rbac-fs/vue` gives you a plugin, a directive, and a composable — `createRbacPlugin(client)`, `v-can`, and `usePermission()` — matching the `a`/`I` naming from the React adapter for a consistent mental model across frameworks.

## Install once

```ts
import { createApp } from 'vue';
import { createRbacPlugin } from 'rbac-fs/vue';
import { RBACClient } from 'rbac-fs/client';
import App from './App.vue';

const client = new RBACClient(await fetch('/me/permissions').then((r) => r.json()));
createApp(App).use(createRbacPlugin(client)).mount('#app');
```

## The directive

```html
<button v-can="{ a: 'invoice', I: 'approve' }">Approve invoice</button>

<button v-can="{ a: 'expense-report', I: 'approve', context: { owner_id: ownerId } }">
  Approve my expense report
</button>
```

## display:none, not unmount — and why that's the right default here

`v-can` toggles `display: none`, the same behavior as Vue's own `v-show` — the element stays in the DOM, just hidden. This is a deliberate parallel to `v-show` specifically: `v-can` is meant to feel like a permission-flavored variant of a directive Vue developers already reach for reflexively, not a new mental model. If you need a true unmount (component lifecycle hooks firing on remove, for instance), reach for `v-if="can(...)"` with the imperative `usePermission()` composable instead — `rbac-fs` gives you both, deliberately, rather than picking one behavior and hiding the other option.

```html
<p v-if="can('invoice', 'approve')">Imperative check: allowed</p>
<p v-else>Imperative check: denied</p>
```

<div class="related-link"><span class="related-label">Related</span><a href="/blog/declarative-permissions-in-react-with-can.html">How this compares to React's <Can> component →</a></div>

For a runnable, headless verification of both the directive and the composable, see [Tutorial: verifying the Vue adapter headlessly](/blog/tutorial-vue-adapter-headless-verify.html).
