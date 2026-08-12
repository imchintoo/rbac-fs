# API Reference

Every public export, with the exact signatures — sourced from `docs/PLAN.md` and cross-checked against `README.md` and `examples/`, not invented.

## `RBAC` (Node core — `import { RBAC } from 'rbac-fs'`)

Full read/write, backed by `.rbac/` on disk. Never import this in a browser bundle.

```ts
new RBAC(options?: {
  tenantId?: string | null;          // omit or null -> `_shared/`
  dataDir?: string;                  // explicit .rbac/ location
  rotation?: RotationOptions;        // see Core Concepts -> Audit logging
  operators?: Record<string, CustomOperator>;
  cache?: boolean;                   // default true
})
```

| Method | Signature | Notes |
|---|---|---|
| `can` | `(user, resource, action, context?) => Promise<boolean>` | The single source of truth every adapter calls into |
| `createRole` | `(name, definition, opts?: { force?: boolean }) => Promise<void>` | Rejects circular `inherits`, reserved names without `force` |
| `grant` | `(role, { resource, actions }) => Promise<void>` | Additive permission grant |
| `revoke` | `(role, { resource, actions }) => Promise<void>` | Removes specific actions, not the whole role |
| `deleteRole` | `(role) => Promise<void>` | |
| `listRoles` | `() => Promise<RoleDefinition[]>` | |
| `getAuditLog` | `(role, { since? }) => Promise<AuditEntry[]>` | Reads `logs/<role>.jsonl` |
| `close` | `() => Promise<void>` | Releases the file watcher + log write stream — always call before process exit |

## `RBACClient` (browser core — `import { RBACClient } from 'rbac-fs/client'`)

Read-only, synchronous, in-memory. No filesystem access, no `close()` needed (holds no OS resources).

```ts
const client = new RBACClient(snapshot: {
  user?: Partial<RbacUser>;
  permissions: Permission[];
  conditions?: Condition[];
}, options?: { operators?: Record<string, CustomOperator> });

client.can(resource: string, action: string, context?: Record<string, unknown>): boolean; // no await
```

The snapshot is deliberately not a full `RoleDefinition` — no `name`/`inherits`/`meta` — it's already-resolved output from whatever backend endpoint your app builds.

## `StorageAdapter`

The interface the Core Engine depends on instead of touching the filesystem directly — this is what keeps the public `RBAC` API stable if the storage layer changes later.

```ts
interface StorageAdapter {
  loadRole(tenantId: string | null, roleName: string): Promise<RoleDefinition>;
  loadAllRoles(tenantId: string | null): Promise<RoleDefinition[]>;
  saveRole(tenantId: string | null, role: RoleDefinition): Promise<void>;
  deleteRole(tenantId: string | null, roleName: string): Promise<void>;
  appendLog(tenantId: string | null, roleName: string, entry: AuditEntry): Promise<void>;
  watch?(tenantId: string | null, callback: (event: ChangeEvent) => void): () => void;
  close?(): Promise<void>;
}
```

`LocalJsonAdapter` is the only shipped implementation today. Because everything routes through this interface, a database-backed adapter can be added later without changing the public `RBAC` class API.

## Role file schema (`roles/<role>.json`)

```json
{
  "name": "manager",
  "label": "Manager",
  "inherits": ["viewer"],
  "permissions": [
    { "resource": "invoice", "actions": ["view", "approve", "reject"] },
    { "resource": "vendor", "actions": ["view", "create"] }
  ],
  "conditions": [
    { "resource": "report", "actions": ["view"], "when": "owner_id == user.id" }
  ],
  "meta": { "createdAt": "2026-08-10T10:00:00Z", "updatedAt": "2026-08-10T10:00:00Z", "createdBy": "chintan" }
}
```

## Audit log entry (`logs/<role>.jsonl`, one JSON object per line)

```json
{"ts":"2026-08-10T10:15:00Z","user":"chintan","role":"manager","action":"invoice:approve","resource":"inv-4521","result":"allow","tenantId":"acme-corp"}
```

## Condition operators

See [Core Concepts → Conditions](/docs/core-concepts.html#conditions-when-and-the-composable-condition-tree) for the full `eq` / `neq` / `gt` / `gte` / `lt` / `lte` / `in` / `notIn` / `exists` / `notExists` / `contains` / `startsWith` / `endsWith` table and the `custom` operator escape hatch.
