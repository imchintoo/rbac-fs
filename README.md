# rbac-fs

Git-friendly, zero-database RBAC — roles and permissions as JSON files,
multi-tenant by default, works in Node and the browser, in JS or TS.

`npm install rbac-fs` gives you role-based access control that stores
roles and permissions as human-readable JSON files under a `.rbac/`
folder — no database to stand up, no opaque policy blob, every role
change is a normal, reviewable diff in your PR.

## Why rbac-fs

| | rbac-fs | Casbin | AccessControl | CASL |
|---|---|---|---|---|
| Storage | Git-friendly JSON files | Model + policy files/DB adapters | In-memory / your own storage | In-memory / your own storage |
| Multi-tenant | Built in, folder-isolated | Manual (namespacing policies yourself) | Manual | Manual |
| Node + browser | One package, both builds | Node-focused | Both, no dedicated browser API | Both |
| Framework adapters | 8 built in (NestJS, Express, Fastify, Koa, React, Vue, Angular, Svelte) | None built in | None built in | Some community adapters |
| Core dependencies | Zero (Core Engine) | Several | Zero | Zero |
| Audit logging | Built in, JSONL + rotation | Not built in | Not built in | Not built in |

## Install

```sh
npm install rbac-fs
```

## Quick start (JavaScript)

```js
import { RBAC } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

const allowed = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
console.log(allowed); // true
```

## Quick start (TypeScript)

```ts
import { RBAC, type RbacUser } from 'rbac-fs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

const user: RbacUser = { id: 'u1', role: 'manager' };
const allowed: boolean = await rbac.can(user, 'invoice', 'approve');
```

Both snippets create `.rbac/tenants/acme-corp/roles/manager.json` on disk
the first time they run — that file is the reviewable source of truth from
then on; hand-editing it works too (and is picked up automatically, see
"Live-reload" below).

## Multi-tenant example

```ts
const acme = new RBAC({ tenantId: 'acme-corp' });
const globex = new RBAC({ tenantId: 'globex-inc' });

await acme.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });
await globex.createRole('manager', { permissions: [{ resource: 'ledger', actions: ['approve'] }] });

// Same role name, completely isolated files and permissions per tenant:
// .rbac/tenants/acme-corp/roles/manager.json
// .rbac/tenants/globex-inc/roles/manager.json

// Omit tenantId (or pass null) to use cross-tenant `_shared/` roles instead:
const platform = new RBAC(); // -> .rbac/_shared/roles/*.json
```

`tenantId` and role names are sanitized against `^[a-zA-Z0-9_-]+$` before
touching the filesystem — path-traversal attempts (`../../etc`, etc.) are
rejected, not silently resolved.

## Audit logging + rotation

Every `can()` call is recorded to `logs/<role>.jsonl` (JSON Lines — one
allow/deny decision per line, so a corrupted line only breaks that one
record). Rotation is on by default and configurable:

```ts
const rbac = new RBAC({
  tenantId: 'acme-corp',
  rotation: {
    maxSize: '5MB',   // rotate the active log once it reaches this size
    maxAge: '90d',     // delete rotated files older than this
    compress: 'gzip',  // compress rotated files
    maxBackups: 12,    // keep at most this many rotated files per role
  },
});

const entries = await rbac.getAuditLog('manager', { since: '2026-08-01' });
```

## Live-reload

Role files are cached in memory for fast `can()` checks, and a
`chokidar`-backed watcher invalidates the cache automatically when a role
file is hand-edited on disk — no restart needed. Disable caching entirely
with `new LocalJsonAdapter({ cache: false })` if you're on a filesystem
where local file-watching isn't reliable (e.g. some networked/shared
volumes).

## Dynamic role management

```ts
await rbac.createRole('supervisor', { inherits: ['viewer'] });
await rbac.grant('supervisor', { resource: 'invoice', actions: ['view', 'approve'] });
await rbac.revoke('supervisor', { resource: 'invoice', actions: ['approve'] });
await rbac.listRoles();
await rbac.deleteRole('supervisor');
```

## Browser usage

The Node package (`rbac-fs`) reads/writes `.rbac/` on disk and should
never ship to a browser bundle. For the browser, fetch an already-resolved
permission snapshot from your backend and use the read-only client instead
— synchronous, in-memory, zero filesystem access:

```ts
import { RBACClient } from 'rbac-fs/client';

const client = new RBACClient(snapshotFromYourApi); // { user?, permissions, conditions? }
client.can('invoice', 'approve'); // synchronous, no await
```

`RBACClient` has no `close()` — unlike the Node `RBAC` class, it holds no
OS resources (no file watchers, no log streams), so there's nothing to
release.

## Framework adapters

Every adapter is a subpath of the same package — one `npm install`, pick
what you need:

| Import | Framework | What it gives you |
|---|---|---|
| `rbac-fs` | — (Node core) | `RBAC` class, full read/write, the entry point every backend adapter wraps |
| `rbac-fs/client` | — (browser core) | `RBACClient`, synchronous read-only `can()` from a snapshot |
| `rbac-fs/express` | Express | `rbacMiddleware(rbac, resource, action, options?)` |
| `rbac-fs/nestjs` | NestJS | `@RequirePermission()` decorator + `RbacGuard` + `provideRbac()` |
| `rbac-fs/fastify` | Fastify | `rbacPlugin` — register once, declare `config: { rbac: { resource, action } }` per route |
| `rbac-fs/koa` | Koa | `rbacMiddleware(rbac, resource, action, options?)`, async/await native |
| `rbac-fs/react` | React | `<RbacProvider>` + `<Can I="approve" a="invoice">` + `usePermission()` |
| `rbac-fs/vue` | Vue 3 | `createRbacPlugin(client)` + `v-can` directive + `usePermission()` composable |
| `rbac-fs/angular` | Angular | `provideRbacClient()` + `RbacService` + `*rbacCan` structural directive |
| `rbac-fs/svelte` | Svelte | `createPermissionStore(client)` (`$permissions(...)`) + `createCanAction(client)` (`use:can`) |

Every adapter is a thin translation layer — none of them re-implement
permission logic; they all call straight into `RBAC.can()` /
`RBACClient.can()`, so the same role/permission files drive every
framework identically.

## Security guardrails (built in, not left to you)

- `tenantId`/role name sanitization against path traversal, on every call.
- Schema validation on every role write (unknown fields, malformed
  permissions/conditions all rejected before touching disk).
- Reserved role names (`admin`, `system-admin`) blocked from accidental
  overwrite unless `{ force: true }`.
- Circular inheritance detection on every `createRole`/`grant`.
- Condition expressions (`when` clauses) use a hand-rolled equality-only
  evaluator — no `eval()`/`Function()` — so a hand-edited role file can't
  become a code-execution vector.

Who's allowed to *call* `createRole`/`grant`/etc. in the first place is
your app's own business rule — check `rbac.can(user, 'role', 'manage')`
(or whatever permission model fits your app) before exposing role
management to end users.

## Minimum requirements

Node.js `>=20`. TypeScript is optional — every subpath ships plain
`.js` (CJS + ESM) with bundled `.d.ts` types; a `.js`-only project never
needs a TypeScript compiler.

## License

MIT
