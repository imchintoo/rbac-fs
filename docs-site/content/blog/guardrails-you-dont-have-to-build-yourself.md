---
title: The guardrails you don't have to build yourself
date: 2026-07-12
excerpt: rbac-fs bakes path sanitization, schema validation, reserved names, and circular-inheritance detection into Core Engine, not left to consumers.
tags: security, architecture
---

Most authorization libraries give you a `can()` function and leave the surrounding safety net entirely up to you. `rbac-fs` treats four specific guardrails as core-engine responsibilities, not optional consumer code, because getting any one of them wrong is a real vulnerability, not a style nit.

## 1. Path sanitization

```ts
new RBAC({ tenantId: '../../etc' }); // throws InvalidIdentifierError
```

`tenantId` and `roleName` are validated against `^[a-zA-Z0-9_-]+$` before either ever reaches a `path.join()` call. This is the guardrail against path traversal: a `tenantId` sourced from a JWT claim or a URL param that a caller forgot to validate can't turn into a read or write outside `.rbac/`.

## 2. Schema validation on write

Every `createRole`/`grant` call validates the incoming role object — valid resource/action names, no unknown fields — before it touches disk. A malformed role object never becomes a malformed role *file*; the rejection happens in memory, synchronously, at the call site.

## 3. Reserved names

```ts
await rbac.createRole('admin', { permissions: [] }); // throws — reserved name
await rbac.createRole('admin', { permissions: [] }, { force: true }); // explicit override
```

Names like `admin` and `system-admin` can't be silently overwritten by an ordinary `createRole` call. Overwriting one requires the explicit `{ force: true }` flag — the same flag used throughout the examples in this series when re-running a demo script, which is worth noticing: `force` is a deliberate, visible opt-in, never a default.

## 4. Circular inheritance detection

```ts
await rbac.createRole('a', { inherits: ['b'] });
await rbac.createRole('b', { inherits: ['a'] }); // throws — would create a cycle
```

On every `createRole`/`grant`, the engine walks the `inherits` chain and rejects anything that would create a cycle. Without this, a resolver walking `inherits` at `can()` time could recurse forever — this guardrail moves that failure to write-time, where it's cheap to reject, instead of read-time, where it would be a production outage.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html">Full Core Concepts reference →</a></div>

## What's deliberately *not* in this list

"Who is allowed to manage roles" — i.e., which role can call `createRole`/`grant` at all — is explicitly left to the consuming app, enforced by calling `rbac.can()` before your own role-mutation endpoints. That's a business policy decision, not a filesystem-safety one, and `rbac-fs` doesn't guess at it on your behalf. See [Verifying rbac-fs's guardrails yourself](/blog/tutorial-verifying-security-guardrails.html) for runnable proof of all four.
