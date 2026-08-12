---
title: "Declarative permissions in React with <Can>"
date: 2026-06-22
excerpt: rbac-fs's React adapter follows CASL's I/a naming convention on purpose — one less thing to relearn if your team already knows CASL's mental model.
tags: react, adapters
---

`rbac-fs/react` gives you two ways to check a permission: a declarative `<Can>` component for JSX, and an imperative `usePermission()` hook for everything else — routing guards, form validation logic, anywhere a boolean is more useful than a React element.

## The provider

```tsx
import { RBACClient } from 'rbac-fs/client';
import { RbacProvider } from 'rbac-fs/react';

const client = new RBACClient(await fetch('/me/permissions').then((r) => r.json()));

function App() {
  return (
    <RbacProvider client={client}>
      {/* rest of your app */}
    </RbacProvider>
  );
}
```

One `RBACClient` instance, fetched once from your snapshot endpoint, provided once at the root.

## Declarative: `<Can>`

```tsx
import { Can } from 'rbac-fs/react';

function ApproveButton() {
  return (
    <Can I="approve" a="invoice" fallback={<span>You can't approve invoices</span>}>
      <button>Approve invoice</button>
    </Can>
  );
}
```

The `I`/`a` prop naming (action / resource) intentionally mirrors CASL's convention rather than inventing a new one — if your team has used CASL before, this reads immediately; if not, it's a one-time thing to learn, documented once, applied everywhere `<Can>` shows up.

## Condition context flows through props

```tsx
function OwnExpenseReportButton({ ownerId }: { ownerId: string }) {
  return (
    <Can I="approve" a="expense-report" context={{ owner_id: ownerId }}>
      <button>Approve my expense report</button>
    </Can>
  );
}
```

The `context` prop is passed straight through to the underlying `client.can()` call, so a `when: 'owner_id == user.id'` conditional grant on the snapshot works exactly the same from `<Can>` as it does calling the client directly.

## Imperative: `usePermission()`

```tsx
function ImperativeCheck() {
  const can = usePermission(); // same client.can(), for use outside JSX
  return can('invoice', 'approve') ? <p>Allowed</p> : <p>Denied</p>;
}
```

<div class="related-link"><span class="related-label">Related</span><a href="/blog/permissions-in-the-browser-without-a-filesystem.html">The RBACClient snapshot model underneath every framework adapter →</a></div>

For a runnable, headless-rendered verification of both, see [Tutorial: testing rbac-fs's React components without a browser](/blog/tutorial-react-adapter-headless-testing.html).
