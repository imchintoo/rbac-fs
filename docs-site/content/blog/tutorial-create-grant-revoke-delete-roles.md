---
title: "Tutorial: create, grant, revoke, delete roles"
date: 2026-08-01
excerpt: A hands-on walkthrough of every dynamic role management call in rbac-fs, with the actual file contents shown at each step.
tags: dynamic-roles, tutorial
---

This walks through the full role-management lifecycle, showing what's actually on disk after each call — useful for building intuition before you wire it into an admin panel.

## Start from nothing

```ts
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
```

No role files exist yet for `acme-corp`. Nothing errors — the folder gets created lazily on first write.

## createRole()

```ts
await rbac.createRole('supervisor', { inherits: ['viewer'] });
```

This writes `.rbac/tenants/acme-corp/roles/supervisor.json` with an empty `permissions` array and `inherits: ["viewer"]`. If `viewer` doesn't exist yet, this still succeeds — inheritance is resolved at check-time (`can()`), not validated for existence at creation time, so you can define roles in whatever order makes sense to you.

## grant()

```ts
await rbac.grant('supervisor', { resource: 'invoice', actions: ['view', 'approve'] });
```

Adds a `{ resource: 'invoice', actions: ['view', 'approve'] }` entry to `supervisor`'s `permissions` array. Calling `grant()` again for the same resource merges actions rather than duplicating the entry.

## revoke()

```ts
await rbac.revoke('supervisor', { resource: 'invoice', actions: ['approve'] });
```

Removes just `approve` from the `invoice` permission — `view` stays. `revoke()` for the last remaining action on a resource removes the whole permission entry, not an empty-actions husk.

## listRoles()

```ts
const roles = await rbac.listRoles();
// [{ name: 'supervisor', inherits: ['viewer'], permissions: [...] }, ...]
```

Returns every role definition for the current tenant (or `_shared/` roles, if no `tenantId` was set) — useful for building the admin UI that lists what exists today.

## deleteRole()

```ts
await rbac.deleteRole('supervisor');
```

Deletes the file. If another role's `inherits` array references `supervisor`, that reference isn't automatically cleaned up — `can()` for the dependent role will simply resolve `supervisor`'s (now-nonexistent) contribution as nothing, not throw. Worth checking `listRoles()` for dependents before deleting a role others might inherit from.

## Try the self-reference edge case

```ts
try {
  await rbac.createRole('self', { inherits: ['self'] });
} catch (err) {
  console.log(err.name); // CircularInheritanceError
}
```

This is a deliberately tricky case — `self` doesn't exist on disk yet when this call runs, so a naive "does the parent role exist" check would misfire with a confusing `RoleNotFoundError` instead. `rbac-fs` runs the cycle check first specifically to get this case right.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html">Full method signatures in the API Reference →</a></div>

Verified against [`examples/02-dynamic-role-management.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/02-dynamic-role-management.mjs).
