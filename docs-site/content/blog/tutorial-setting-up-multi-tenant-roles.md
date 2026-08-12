---
title: "Tutorial: setting up multi-tenant roles"
date: 2026-07-22
excerpt: A hands-on walkthrough of tenant-scoped and shared roles in rbac-fs, including the path-sanitization behavior you should verify yourself.
tags: multi-tenant, tutorial
---

This is the hands-on companion to [Multi-tenant permissions without a database](/blog/multi-tenant-permissions-without-a-database.html) — actually setting up two tenants and a shared, platform-level role.

## Create two tenant-scoped instances

```ts
import { RBAC } from 'rbac-fs';

const acme = new RBAC({ tenantId: 'acme-corp' });
const globex = new RBAC({ tenantId: 'globex-inc' });
```

Each `RBAC` instance is bound to one tenant for its lifetime — there's no method to switch tenants on an existing instance, which is intentional: it removes an entire class of bug where a request handler accidentally reuses an instance across two different tenants' requests.

## Create the same role name in both, independently

```ts
await acme.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });
await globex.createRole('manager', { permissions: [{ resource: 'ledger', actions: ['approve'] }] });
```

Two files, completely independent:

```text
.rbac/tenants/acme-corp/roles/manager.json
.rbac/tenants/globex-inc/roles/manager.json
```

```ts
await acme.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve'); // true
await acme.can({ id: 'u1', role: 'manager' }, 'ledger', 'approve');  // false — globex-only permission
await globex.can({ id: 'u1', role: 'manager' }, 'ledger', 'approve'); // true
```

Same role name, zero leakage between them — `acme`'s instance has no code path that reads `globex-inc`'s folder at all.

## Add a platform-level shared role

```ts
const platform = new RBAC(); // no tenantId -> `_shared/`
await platform.createRole('support-agent', { permissions: [{ resource: 'tenant', actions: ['impersonate'] }] });
```

`_shared/` roles are a fully separate namespace, not inheritable by tenant roles — a deliberate isolation-first decision (see `docs/PLAN.md` §12), so a tenant role can never accidentally pick up platform-level permissions through an inheritance chain.

## Verify the guardrail yourself

```ts
try {
  new RBAC({ tenantId: '../../etc' });
} catch (err) {
  console.log(err.name, '-', err.message); // InvalidIdentifierError
}
```

`tenantId` is validated against `^[a-zA-Z0-9_-]+$` before it ever reaches a `path.join()` call — worth running this exact snippet yourself once in a throwaway script, not just trusting the docs, before you build multi-tenant provisioning on top of it.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html#multi-tenancy">Full multi-tenancy model in Core Concepts →</a></div>

Verified against [`examples/04-multi-tenant.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/04-multi-tenant.mjs), which runs this exact sequence against the real built package.
