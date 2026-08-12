---
title: How rbac-fs resolves a permission check
date: 2026-08-07
excerpt: What actually happens between calling can() and getting true or false back — role loading, inheritance, and condition evaluation, in order.
tags: core-engine, architecture
---

`await rbac.can(user, 'invoice', 'approve')` looks like a single operation. It's actually a small pipeline, and understanding the order matters once you're debugging why a permission you expected to be granted isn't.

## Step 1: load the role

The Core Engine asks the configured `StorageAdapter` (`LocalJsonAdapter` by default) for the user's role definition — `.rbac/tenants/<tenantId>/roles/<role>.json`, or `.rbac/_shared/roles/<role>.json` if no `tenantId` was set. This read is cached in memory after the first call; a hand-edited file on disk invalidates that cache automatically via the file watcher, not on a timer.

## Step 2: walk the inheritance chain

If the role has an `inherits` array, the engine walks it, collecting permissions from every ancestor role. `manager` inheriting from `viewer` means a `manager` check also considers everything `viewer` was granted — resolved once per check, not pre-flattened and stored, so a change to `viewer` takes effect for every role that inherits from it without touching those roles' own files.

## Step 3: check for an unconditional grant

```ts
await rbac.grant('clerk', { resource: 'invoice', actions: ['view'] });
await rbac.can(clerkUser, 'invoice', 'view'); // true — matched directly, no condition to evaluate
```

If a matching `resource`/`action` pair exists in `permissions` with no attached condition, the check short-circuits to `true` here — this is the common case and the fastest path.

## Step 4: evaluate conditions, if any matched permission has one

```ts
await rbac.createRole('mobile-approver', {
  conditions: [{ resource: 'invoice.line-items', actions: ['approve'], condition: { op: 'eq', path: 'device', value: 'mobile' } }],
});
await rbac.can(user, 'invoice.line-items', 'approve', { device: 'mobile' }); // true
await rbac.can(user, 'invoice.line-items', 'approve', { device: 'desktop' }); // false
```

Only if a `resource`/`action` match has an attached `when`/`condition` does the engine evaluate it against the `context` argument — see [Conditional permissions in rbac-fs](/blog/conditional-permissions-in-rbac-fs.html) for the full operator set. No match at all, at any step, means `false` — there's no implicit "unknown resource defaults to allow" path.

## Step 5: log the decision

Every `can()` call — allow or deny — writes one line to `logs/<role>.jsonl`. This happens after the decision is made, never before, so a crash mid-evaluation can't produce a misleading log entry for a check that didn't actually complete.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html">See the full role and permission model in Core Concepts →</a></div>

## Why this order matters in practice

The most common "why isn't this working" question is a condition that never gets evaluated because step 3 never found a matching `resource`/`action` in the first place — the condition on a permission you don't have doesn't get consulted, because there's nothing to attach it to. Check the permission grant exists before debugging the condition logic; the pipeline above is the order to check things in.
