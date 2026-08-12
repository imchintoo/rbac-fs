---
title: Why roles should change without a redeploy
date: 2026-08-03
excerpt: A permission system that requires a deploy to add one role is solving the wrong problem — how rbac-fs makes role changes a runtime operation instead.
tags: dynamic-roles, architecture
---

A surprising number of access-control systems bake roles into application code — an enum, a switch statement, a constants file that ships with the next release. That works fine until the day a customer needs a role that doesn't exist yet, and "we'll ship that next sprint" is not an acceptable answer to a support ticket.

## Roles as data, not code

`rbac-fs` treats role creation, permission grants, and revocations as runtime operations against files, not compile-time constants:

```ts
await rbac.createRole('supervisor', { inherits: ['viewer'] });
await rbac.grant('supervisor', { resource: 'invoice', actions: ['view', 'approve'] });
await rbac.revoke('supervisor', { resource: 'invoice', actions: ['approve'] });
await rbac.listRoles();
await rbac.deleteRole('supervisor');
```

Every one of these is an `await`-able call your application can expose behind its own admin UI, CLI, or API endpoint — no code change, no build, no deploy required to add a role your business needs today.

## What "dynamic" doesn't mean

It doesn't mean unrestricted. Two guardrails apply to every one of these calls, not as an afterthought:

- **Reserved names** (`admin`, `system-admin`) are protected from accidental overwrite unless you explicitly pass `{ force: true }`.
- **Circular inheritance** is rejected — `createRole('a', { inherits: ['b'] })` where `b` already (transitively) inherits from `a` throws `CircularInheritanceError` instead of creating a graph your resolution logic could loop on forever.

Both are enforced in the Core Engine itself, so they apply no matter which framework adapter or admin UI triggered the call — see [Security Guardrails](/docs/security.html) for the full list.

## Who gets to call these, though

`rbac-fs` deliberately does not decide who's allowed to *call* `createRole`/`grant`/`deleteRole` — that's your application's own business rule, not a package concern:

```ts
if (await rbac.can(currentUser, 'role', 'manage')) {
  await rbac.createRole('supervisor', { inherits: ['viewer'] });
}
```

This is the same `can()` your app already uses for every other permission check — role management is just another resource, `'role'`, with its own actions. There's no separate "admin mode" API surface to learn.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html#roles-permissions-and-inheritance">Roles, permissions, and inheritance in Core Concepts →</a></div>

## The trade-off, stated plainly

Runtime-mutable roles mean the audit trail matters more, not less — see [Every allow and deny, logged](/blog/every-allow-and-deny-logged.html) for how `rbac-fs` records every decision, and why that's the piece that makes "roles can change anytime" safe instead of just convenient.
