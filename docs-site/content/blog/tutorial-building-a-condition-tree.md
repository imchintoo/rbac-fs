---
title: "Tutorial: building a condition tree with rbac-fs"
date: 2026-07-24
excerpt: Step-by-step construction of an AND/OR condition tree in rbac-fs, from a single clause to a nested, real-world approval rule.
tags: conditions, tutorial
---

This builds up a real condition tree one piece at a time, so each operator's purpose is clear before combining them.

## Start with one clause

```ts
await rbac.createRole('clerk', {
  conditions: [{ resource: 'invoice.line-items', actions: ['approve'], condition: { op: 'eq', path: 'device', value: 'mobile' } }],
});

await rbac.can(user, 'invoice.line-items', 'approve', { device: 'mobile' });  // true
await rbac.can(user, 'invoice.line-items', 'approve', { device: 'desktop' }); // false
```

`path` reads from the `context` object (the 4th argument to `can()`). A `path` prefixed with `user.` reads from the user object instead — `{ op: 'eq', path: 'user.department', value: 'finance' }` checks a field on the user, not the context.

## Add a second condition with `and`

```ts
condition: {
  and: [
    { op: 'eq', path: 'device', value: 'mobile' },
    { op: 'in', path: 'location', value: ['US', 'IN', 'EU'] },
  ],
}
```

Both must be true. `in` checks membership in a literal list — useful for "one of these regions" without writing three separate `eq`/`or` clauses.

## Add an `or` branch

```ts
condition: {
  or: [
    { op: 'eq', path: 'user.role', value: 'senior-approver' },
    {
      and: [
        { op: 'eq', path: 'device', value: 'mobile' },
        { op: 'lt', path: 'amount', value: 500 },
      ],
    },
  ],
}
```

This reads as: allow if the user is a senior approver, *or* if it's a mobile approval under $500 — two genuinely different paths to the same permission, expressed as one tree instead of two separate role definitions.

## Negate with `not`

```ts
condition: { not: { op: 'eq', path: 'status', value: 'locked' } }
```

Straightforward, but easy to forget exists — useful for "anything except this one state" without enumerating every other valid state in an `in` list.

## Check field presence before comparing

```ts
condition: {
  and: [
    { op: 'exists', path: 'owner_id' },
    { op: 'eq', path: 'owner_id', valuePath: 'user.id' },
  ],
}
```

`valuePath` (instead of a literal `value`) compares two *paths* against each other — here, "does `context.owner_id` equal `user.id`" — the tree-based equivalent of the legacy `when: 'owner_id == user.id'` clause, but composable with other conditions around it.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html#condition-operators">Full operator reference in the API docs →</a></div>

Verified against [`examples/03-conditional-grants.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/03-conditional-grants.mjs) and `docs/PLAN.md`'s condition-tree specification.
