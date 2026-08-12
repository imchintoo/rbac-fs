# Security Guardrails

Built into the Core Engine, not left for you to implement — every rule below applies no matter which adapter or framework called into it.

<div class="callout security">These guardrails run in exactly one place — the Core Engine — regardless of which framework or side (backend/frontend) triggered the call. Adapters never re-implement, re-validate, or bypass any of this.</div>

## Path / identifier sanitization

`tenantId` and role names must match `^[a-zA-Z0-9_-]+$`. Anything else is rejected before it ever touches `path.join()` — this is what prevents a malicious or buggy `tenantId` from becoming a path-traversal vector (`../../etc`, etc.).

```ts
try {
  new RBAC({ tenantId: '../../etc' });
} catch (err) {
  console.log(err.name); // InvalidIdentifierError
}
```

## Schema validation on every write

Every `createRole` / `grant` call validates the incoming role object before it's written to disk — valid resource/action names, no unknown fields. A hand-edited role file with an invalid shape is caught, not silently accepted.

## Reserved names

System role names (`admin`, `system-admin`) are protected from accidental overwrite unless you explicitly pass `{ force: true }`.

## Circular inheritance detection

Every `createRole` / `grant` walks the `inherits` chain and rejects anything that would create a cycle — including the edge case of a role referencing itself before it exists on disk (`createRole('self', { inherits: ['self'] })` throws `CircularInheritanceError`, not a confusing `RoleNotFoundError`).

## No `eval()`, ever

Condition expressions — both the legacy `when: string` clause and the composable `condition` tree — evaluate against a fixed, hand-rolled operator vocabulary. A hand-edited role file cannot become a code-execution vector. `custom` operators call a function *you* registered in your own code at startup; nothing is ever parsed out of the JSON file and executed.

## What's your responsibility

<div class="callout tip">Who's allowed to <em>call</em> <code>createRole</code> / <code>grant</code> / <code>deleteRole</code> in the first place is your app's own business rule, not something the package can enforce for you. Check <code>rbac.can(user, 'role', 'manage')</code> — or whatever permission model fits your app — before exposing role management to end users.</div>

```ts
// Example: gate role management behind its own permission
if (await rbac.can(currentUser, 'role', 'manage')) {
  await rbac.createRole('supervisor', { inherits: ['viewer'] });
}
```

## Zero dependencies in the Core Engine

The permission-evaluation path (`can()`, role resolution, condition evaluation) has zero third-party runtime dependencies — a smaller, more auditable surface than a full policy-engine dependency tree.
