---
title: "Tutorial: testing React components headlessly"
date: 2026-06-20
excerpt: A headless react-test-renderer walkthrough of <Can>, RbacProvider, and usePermission() — the same technique the adapter's own test suite uses.
tags: react, tutorial
---

No DOM, no browser, no Vite dev server — just `react-test-renderer`, which is exactly how the adapter's own tests verify this behavior.

## The full component tree

```tsx
import { RBACClient } from 'rbac-fs/client';
import { Can, RbacProvider, usePermission } from 'rbac-fs/react';

function ApproveButton() {
  return (
    <Can I="approve" a="invoice" fallback={<span>You can't approve invoices</span>}>
      <button>Approve invoice</button>
    </Can>
  );
}

function ImperativeCheck() {
  const can = usePermission();
  return can('invoice', 'approve') ? <p>Imperative check: allowed</p> : <p>Imperative check: denied</p>;
}

function App({ client }: { client: RBACClient }) {
  return (
    <RbacProvider client={client}>
      <ApproveButton />
      <ImperativeCheck />
    </RbacProvider>
  );
}
```

## Render it with a permissive client

```tsx
import { act, create } from 'react-test-renderer';

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
});

let renderer;
act(() => {
  renderer = create(<App client={client} />);
});
console.log(JSON.stringify(renderer.toJSON(), null, 2));
// renders the real <button>Approve invoice</button> and "Imperative check: allowed"
```

## Render it again with a client that has nothing

```tsx
const otherClient = new RBACClient({ user: { id: 'u2' }, permissions: [] });

let deniedRenderer;
act(() => {
  deniedRenderer = create(<App client={otherClient} />);
});
console.log(JSON.stringify(deniedRenderer.toJSON(), null, 2));
// renders the fallback <span> and "Imperative check: denied" — same tree, different client
```

Two renders, two different `RBACClient` instances, same component tree — this is the cleanest way to prove your permission-gated UI actually branches correctly, and it's fast enough to run in CI on every commit.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html">Full adapter API reference →</a></div>

Verified against [`examples/12-react-usage.tsx`](https://github.com/imchintoo/rbac-fs/blob/main/examples/12-react-usage.tsx), runnable with `node --import tsx`.
