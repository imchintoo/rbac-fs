# Core Concepts

The five ideas that make up the whole model: files as source of truth, tenants, roles, permissions, and conditions.

## The `.rbac/` folder

Every role, and every role's audit log, is a plain file:

```text
.rbac/
├── tenants/
│   ├── acme-corp/
│   │   ├── roles/
│   │   │   ├── admin.json
│   │   │   ├── manager.json
│   │   │   └── viewer.json
│   │   └── logs/
│   │       ├── manager.jsonl
│   │       └── manager.jsonl.1.gz   ← rotated + compressed
│   └── globex-inc/
│       ├── roles/...
│       └── logs/...
└── _shared/
    ├── roles/
    │   └── system-admin.json         ← cross-tenant / platform-level roles
    └── logs/
        └── system-admin.jsonl
```

Where `.rbac/` lives is resolved in priority order: an explicit `dataDir` option, the `RBAC_DATA_DIR` environment variable, the nearest `package.json` folder, or `process.cwd()/.rbac` as a fallback. There is no `postinstall` step — initialization is lazy, on first use, which keeps the package clean for supply-chain audits.

## Multi-tenancy

```ts
const acme = new RBAC({ tenantId: 'acme-corp' });
const globex = new RBAC({ tenantId: 'globex-inc' });

await acme.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });
await globex.createRole('manager', { permissions: [{ resource: 'ledger', actions: ['approve'] }] });

// Same role name, completely isolated files and permissions:
// .rbac/tenants/acme-corp/roles/manager.json
// .rbac/tenants/globex-inc/roles/manager.json

// Omit tenantId (or pass null) for cross-tenant `_shared/` roles:
const platform = new RBAC();
```

Tenant separation is structural — folder isolation, not a `WHERE tenant_id = ?` clause you have to remember everywhere. `_shared/` roles are a fully separate namespace from tenant roles, not inheritable by them.

## Roles, permissions, and inheritance

```ts
await rbac.createRole('supervisor', { inherits: ['viewer'] });
await rbac.grant('supervisor', { resource: 'invoice', actions: ['view', 'approve'] });
await rbac.revoke('supervisor', { resource: 'invoice', actions: ['approve'] });
await rbac.listRoles();
await rbac.deleteRole('supervisor');
```

Every `createRole` / `grant` walks the `inherits` chain and rejects anything that would create a cycle (A inherits B inherits A) — a `CircularInheritanceError`, not a silent hang.

## Feature-scoped permissions

`resource` is a free-form string with no built-in hierarchy — a feature is just its own resource id, dot-separated by convention. Granting a module does **not** automatically grant its features:

```ts
await rbac.grant('clerk', { resource: 'invoice', actions: ['view'] }); // module-level
await rbac.grant('clerk', { resource: 'invoice.line-items', actions: ['add', 'edit'] }); // feature-level

await rbac.can(clerkUser, 'invoice', 'view'); // true
await rbac.can(clerkUser, 'invoice.line-items', 'add'); // true
await rbac.can(clerkUser, 'invoice', 'add'); // false — no wildcard rollup
```

## Conditions — `when` and the composable `condition` tree

A single `when: "a == b"` clause can't express "device is mobile **and** location is in this list." The `condition` tree solves that with `and`/`or`/`not` nodes over a fixed, safe operator vocabulary — zero `eval()`/`Function()`, just JSON:

```ts
await rbac.createRole('mobile-approver', {
  conditions: [
    {
      resource: 'invoice.line-items',
      actions: ['approve'],
      condition: {
        and: [
          { op: 'eq', path: 'device', value: 'mobile' },
          { op: 'in', path: 'location', value: ['US', 'IN', 'EU'] },
        ],
      },
    },
  ],
});

await rbac.can(user, 'invoice.line-items', 'approve', { device: 'mobile', location: 'IN' }); // true
```

| Operator | Meaning |
|---|---|
| `eq` / `neq` | equal / not equal |
| `gt` / `gte` / `lt` / `lte` | numeric comparison |
| `in` / `notIn` | membership in a literal list |
| `exists` / `notExists` | is the resolved value defined? |
| `contains` | substring match, or array membership |
| `startsWith` / `endsWith` | string prefix/suffix match |

The legacy `when: string` form still works unchanged — both evaluate through the same evaluator, no migration needed. For app-specific logic the fixed operators can't express, register a named `custom` predicate via `RBACOptions.operators` — the engine calls a real function you wrote, never anything parsed out of the role file.

## Live-reload

Role files are cached in memory for fast `can()` checks. A `chokidar`-backed watcher invalidates that cache automatically when a role file is hand-edited on disk — no restart needed. Disable it with `new LocalJsonAdapter({ cache: false })` on filesystems where local file-watching isn't reliable (some networked/shared volumes).

## Audit logging + rotation

Every `can()` call is recorded to `logs/<role>.jsonl` — one allow/deny decision per line, so a corrupted line only ever breaks that one record, unlike a single JSON array or YAML document.

```ts
const rbac = new RBAC({
  tenantId: 'acme-corp',
  rotation: { maxSize: '5MB', maxAge: '90d', compress: 'gzip', maxBackups: 12 },
});

const entries = await rbac.getAuditLog('manager', { since: '2026-08-01' });
```

Defaults are conservative and fully overridable — check your compliance requirements before relying on the default `maxAge`.
