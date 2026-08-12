# React

`<RbacProvider>` + `<Can I="..." a="...">` + `usePermission()` — `import ... from 'rbac-fs/react'`. Naming follows CASL's convention (`I` = action, `a` = resource) for a familiar mental model.

## Usage

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

function OwnExpenseReportButton({ ownerId }: { ownerId: string }) {
  // context threads through to conditional (`when`/`condition`) grants
  return (
    <Can I="approve" a="expense-report" context={{ owner_id: ownerId }}>
      <button>Approve my expense report</button>
    </Can>
  );
}

function ImperativeCheck() {
  const can = usePermission(); // same client.can(), for use outside JSX
  return can('invoice', 'approve') ? <p>Allowed</p> : <p>Denied</p>;
}

function App({ client }: { client: RBACClient }) {
  return (
    <RbacProvider client={client}>
      <ApproveButton />
      <OwnExpenseReportButton ownerId="u1" />
      <ImperativeCheck />
    </RbacProvider>
  );
}
```

`RBACClient` is built from a permission snapshot your backend resolves and returns — never read `.rbac/` files directly in the browser. Full verification (rendered headlessly with `react-test-renderer`): [`examples/12-react-usage.tsx`](https://github.com/imchintoo/rbac-fs/blob/main/examples/12-react-usage.tsx).

<div class="callout tip">Next.js: no separate adapter needed — <code>rbac-fs/react</code> works as-is on top of it. Fetch and hydrate the snapshot server-side; never read <code>.rbac/</code> files during SSR render.</div>
