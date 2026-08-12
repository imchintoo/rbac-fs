/**
 * 12 — React: <RbacProvider> + <Can I="..." a="..."> + usePermission().
 * Naming follows CASL's convention ("I" = action, "a" = resource) per
 * docs/PLAN.md.
 *
 * This is idiomatic app code — copy it into a real React project (needs a
 * JSX/TSX build step: Vite, Next.js, CRA, etc.). The verification at the
 * bottom of this file renders it headlessly with react-test-renderer (no
 * DOM needed) to prove the real components behave as documented.
 *
 * Run: node --import tsx examples/12-react-usage.tsx
 */
import React from 'react'; // classic JSX runtime — swap for your bundler's automatic runtime if configured
import { RBACClient } from 'rbac-fs/client';
import { Can, RbacProvider, usePermission } from 'rbac-fs/react';

// --- Real app code -----------------------------------------------------

function ApproveButton() {
  return (
    <Can I="approve" a="invoice" fallback={<span>You can't approve invoices</span>}>
      <button>Approve invoice</button>
    </Can>
  );
}

function OwnExpenseReportButton({ ownerId }: { ownerId: string }) {
  // context is threaded through to conditional (`when`) grants
  return (
    <Can I="approve" a="expense-report" context={{ owner_id: ownerId }}>
      <button>Approve my expense report</button>
    </Can>
  );
}

function ImperativeCheck() {
  const can = usePermission(); // same client.can(), for use outside JSX (routing guards, form logic, etc.)
  return can('invoice', 'approve') ? <p>Imperative check: allowed</p> : <p>Imperative check: denied</p>;
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

// --- Verification: render headlessly with react-test-renderer -----------

const { createElement } = await import('react');
const { act, create } = await import('react-test-renderer');

const client = new RBACClient({
  user: { id: 'u1' },
  permissions: [{ resource: 'invoice', actions: ['approve'] }],
  conditions: [{ resource: 'expense-report', actions: ['approve'], when: 'owner_id == user.id' }],
});

let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(createElement(App, { client }));
});
console.log(JSON.stringify(renderer.toJSON(), null, 2));

const otherClient = new RBACClient({ user: { id: 'u2' }, permissions: [] });
let deniedRenderer!: ReturnType<typeof create>;
act(() => {
  deniedRenderer = create(createElement(App, { client: otherClient }));
});
console.log('\nas a user with no permissions:');
console.log(JSON.stringify(deniedRenderer.toJSON(), null, 2));
