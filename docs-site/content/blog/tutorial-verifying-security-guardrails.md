---
title: "Tutorial: verifying the security guardrails"
date: 2026-07-10
excerpt: Don't take the docs' word for it — four runnable snippets proving path sanitization and circular-inheritance detection actually reject what they claim to.
tags: security, tutorial
---

Trust, but verify — especially for anything security-adjacent. These four snippets are meant to be pasted into a throwaway script and run against your actual installed version, not just read.

## Path traversal attempts are rejected before they touch disk

```ts
import { RBAC } from 'rbac-fs';

try {
  new RBAC({ tenantId: '../../etc' });
} catch (err) {
  console.log(err.name, '-', err.message); // InvalidIdentifierError
}

try {
  new RBAC({ tenantId: 'acme corp' }); // space isn't in ^[a-zA-Z0-9_-]+$
} catch (err) {
  console.log(err.name); // InvalidIdentifierError
}
```

Both throw before any filesystem call is made — the validation is a plain regex check at construction time, not a try/catch around a failed `fs` operation.

## Reserved names require an explicit opt-in

```ts
const rbac = new RBAC();

try {
  await rbac.createRole('admin', { permissions: [] });
} catch (err) {
  console.log(err.name); // rejected — reserved name
}

const forced = await rbac.createRole('admin', { permissions: [] }, { force: true });
console.log('forced create succeeded:', !!forced);
```

## Circular inheritance is caught at write-time, not read-time

```ts
await rbac.createRole('role-a', { inherits: ['role-b'] }, { force: true });

try {
  await rbac.createRole('role-b', { inherits: ['role-a'] }, { force: true });
} catch (err) {
  console.log(err.name); // rejected — would create a cycle
}
```

Run this exact sequence and confirm the second call throws — if it doesn't, that's a regression worth filing, not something to work around.

## Schema validation rejects malformed permission objects

```ts
try {
  await rbac.createRole('bad-role', {
    permissions: [{ resource: 'invoice', actions: ['approve'], extraField: 'nope' }],
  });
} catch (err) {
  console.log(err.name); // schema validation error — unknown field
}
```

<div class="related-link"><span class="related-label">Related</span><a href="/blog/guardrails-you-dont-have-to-build-yourself.html">Why these four guardrails live in Core Engine →</a></div>

Verified against `docs/PLAN.md` §8's guardrail table — run these yourself before relying on any of the four in a security-sensitive path of your own app.
