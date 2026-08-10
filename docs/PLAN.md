# rbac-fs — Implementation Plan
> Purpose: Zero-database, file-based, multi-tenant RBAC package that works in both
> Node.js backends and browser frontends. This doc is the spec to hand to Claude Code
> for implementation, phase by phase.

---

## 1. Goals & Non-Goals

**Goals**
- `npm install` → zero-config → works immediately (no DB setup)
- Roles + permissions stored as human-readable, git-friendly JSON files
- Multi-tenant from day 1 (tenant-isolated folders)
- Role-wise activity/audit logs, with automatic rotation so files never grow unbounded
- Works in Node.js (backend, full read/write) and in browsers (frontend, read-only snapshot)
- Dynamic: roles/permissions can be created, edited, deleted at runtime — no redeploy needed
- Future-proof: swapping file storage for a database later should not break the public API

**Non-Goals (for v1)**
- No built-in database adapter (Postgres/Mongo) — interface allows it later, not built now
- No UI/admin panel shipped — package is a library; admin panel is the consumer's job
- No distributed/multi-server real-time sync in v1 (single-instance or shared-filesystem only)

---

## 2. Package Identity

- **Package name: `rbac-fs`** — confirmed available on npm registry (checked
  2026-08-10). Convention matches established fs-based packages (`fs-extra`,
  `graceful-fs`) — instantly communicates "filesystem-based RBAC."
- GitHub repo: `imchintoo/rbac-fs`
- npm: `npm install rbac-fs` — **single published package**, not ten separate
  ones. Framework adapters are **subpath exports of the same package**, managed
  as a monorepo internally but published as one npm artifact.
- Repo layout (monorepo, single publish target):
  ```
  rbac-fs/
  ├── src/
  │   ├── core/              → rbac-fs           (main entry)
  │   ├── client/             → rbac-fs/client     (browser snapshot API)
  │   └── adapters/
  │       ├── nestjs/         → rbac-fs/nestjs
  │       ├── express/        → rbac-fs/express
  │       ├── fastify/        → rbac-fs/fastify
  │       ├── koa/             → rbac-fs/koa
  │       ├── hapi/            → rbac-fs/hapi
  │       ├── hono/            → rbac-fs/hono
  │       ├── react/           → rbac-fs/react
  │       ├── vue/             → rbac-fs/vue
  │       ├── angular/         → rbac-fs/angular
  │       └── svelte/          → rbac-fs/svelte
  ├── dist/                    ← build output, per subpath (cjs + esm + .d.ts)
  └── package.json
  ```
- Import pattern for consumers — **one install, pick the subpath you need**:
  ```typescript
  import { RBAC } from 'rbac-fs';               // core, Node backend
  import { RBACClient } from 'rbac-fs/client';   // browser snapshot API
  import { RbacGuard } from 'rbac-fs/nestjs';    // NestJS adapter
  import { rbacMiddleware } from 'rbac-fs/express';
  import { Can, usePermission } from 'rbac-fs/react';
  ```
  This is why the folder convention `rbac-fs/**` matters — every adapter's
  import path IS its folder path under `src/adapters/`, which keeps source
  layout, subpath exports, and documentation all in sync by construction.
- **Why single package over separate npm packages (like a hypothetical `rbac-fs-nestjs`):**
  one version number to track, one `npm install`, no risk of a consumer running
  mismatched core/adapter versions, and it avoids needing to name-check and
  separately publish/maintain ten registry entries. Trade-off: consumers who
  only need the Node core still download adapter source in the tarball unless
  package.json's `files` field is scoped tightly per subpath at publish time —
  acceptable since adapters are thin (§3.1) and total package size stays small.
- License: MIT
- **Language: written in TypeScript, but JavaScript is a first-class consumer**
  — see §2.1.
- Positioning line for README: *"Git-friendly, zero-database RBAC — roles and permissions
  as JSON files, multi-tenant by default, works in Node and the browser, in JS or TS."*
- Differentiation vs Casbin / AccessControl / CASL (for README comparison table):
  - File-first, human-editable, PR-reviewable roles (not a single opaque policy blob)
  - Multi-tenant folder isolation built in, not bolted on
  - First-class dual build for backend + frontend from one package
  - Zero dependencies in the core engine
  - Works identically well from plain JavaScript or TypeScript — no TS required

### 2.1 JavaScript + TypeScript support — how both are first-class

- **Source**: written in TypeScript (best authoring experience, catches bugs
  at build time for the package's own maintainers).
- **Build output**: every subpath ships as compiled `.js` (both CJS `require()`
  and ESM `import` builds) — a plain JavaScript project never needs a TS
  compiler or ts-node to use `rbac-fs`. `npm install rbac-fs` + `require('rbac-fs')`
  or `import { RBAC } from 'rbac-fs'` both work out of the box in a `.js` file.
- **Types**: every subpath also ships a matching `.d.ts`. TypeScript consumers
  get full autocomplete/type-checking on `RoleDefinition`, `AuditEntry`,
  `can()` signatures, etc. — automatically, no `@types/rbac-fs` package needed
  (types are bundled, not separate, which is the modern standard).
- **JSDoc for JS-only consumers**: internally annotate public APIs with JSDoc
  comments (in the `.ts` source, they compile through) so that even editors
  that only read `.d.ts`/JSDoc (VS Code IntelliSense in `.js` files) show
  helpful hints without the consumer opening a single `.ts` file.
- **No TS-specific runtime dependency**: nothing in the shipped `dist/` should
  require `reflect-metadata` or decorators-as-runtime-feature at the core-engine
  level — decorators are fine *inside* the NestJS adapter only (NestJS already
  requires them), but the core `rbac-fs` and `rbac-fs/client` entry points must
  run in vanilla Node/browser JS with zero TS-only runtime assumptions.
- **package.json `exports` map carries both `types` and `default`/`require`/`import`
  conditions per subpath**, e.g.:
  ```json
  "exports": {
    ".": {
      "types": "./dist/core/index.d.ts",
      "node": "./dist/core/index.node.js",
      "browser": "./dist/core/index.browser.js",
      "import": "./dist/core/index.mjs",
      "require": "./dist/core/index.cjs"
    },
    "./react": {
      "types": "./dist/adapters/react/index.d.ts",
      "import": "./dist/adapters/react/index.mjs",
      "require": "./dist/adapters/react/index.cjs"
    }
  }
  ```
  (repeat the `import`/`require`/`types` triplet for every subpath in the tree above)

---

## 3. High-Level Architecture

Three layers, strict separation:

```
┌─────────────────────────────────────────────┐
│  Layer 3: Framework Adapters (later phases)  │
│  rbac-fs/nestjs, rbac-fs/express, rbac-fs/react        │
├─────────────────────────────────────────────┤
│  Layer 2: Runtime Faces                      │
│  Node build (fs read/write)                  │
│  Browser build (in-memory snapshot, no fs)   │
├─────────────────────────────────────────────┤
│  Layer 1: Core Engine (pure TS, isomorphic)  │
│  Role resolution, permission evaluation,     │
│  hierarchy/inheritance, validation           │
└─────────────────────────────────────────────┘
```

**Core Engine** never touches the filesystem directly — it depends on a
`StorageAdapter` interface. This is what keeps the package future-proof.

### 3.1 Framework Support Strategy — the key rule

**Validation and permission logic live ONLY in the Core Engine.** Framework
adapters are thin translation layers — they take a framework-specific request
object, extract `(user, resource, action, context)`, call the core `can()`,
and translate the boolean result into that framework's idiom (throw an
exception, call `next()`, return a response). No adapter re-implements
validation, sanitization, or permission-resolution logic. This is what makes
"support every framework" tractable — one adapter is maybe 30-50 lines because
it does no real work, just wiring.

```
Request object (framework-specific)
        │
        ▼
   Adapter: extract (user, resource, action, context)
        │
        ▼
   Core.can(user, resource, action, context)   ← single source of truth
        │
        ▼
   Adapter: translate boolean → framework response (403 / next() / throw)
```

**Backend adapters (Node.js — cover the frameworks actually used in industry):**

| Adapter package | Framework | Integration shape |
|---|---|---|
| `rbac-fs/nestjs` | NestJS | `@RequirePermission()` decorator + `RbacGuard` |
| `rbac-fs/express` | Express | `rbac.middleware('resource', 'action')` |
| `rbac-fs/fastify` | Fastify | plugin, uses Fastify's `onRequest` hook + native JSON Schema validation for permission-check payloads |
| `rbac-fs/koa` | Koa | middleware using `ctx` (async/await native, no `next()` callback style) |
| `rbac-fs/hapi` | Hapi | plugin registered via Hapi's own `pre` validation lifecycle |
| `rbac-fs/hono` | Hono | middleware for edge/serverless (Cloudflare Workers, Vercel Edge) — must avoid Node-only APIs (`fs`, `path`) entirely in the request path, so this adapter talks to the core only through the `RemoteApiAdapter`/snapshot mode, never `LocalJsonAdapter` |

Priority order for build: **NestJS → Express → Fastify** first (matches
current stack + widest combined install base), then Koa/Hapi/Hono as
community-driven or later phases — don't block v1.0 on all six.

**Frontend adapters (browser — cover the frameworks actually used in industry):**

| Adapter package | Framework | Integration shape |
|---|---|---|
| `rbac-fs/react` | React | `<Can I="approve" a="invoice">` component + `usePermission()` hook |
| `rbac-fs/vue` | Vue 3 | `v-can` directive + `usePermission()` composable |
| `rbac-fs/angular` | Angular | `*rbacCan` structural directive + `RbacService` (DI-based, matches Angular idioms) |
| `rbac-fs/svelte` | Svelte/SvelteKit | a Svelte store (`$permissions`) + a `can()` action |
| — | Next.js / Nuxt | no separate adapter needed — these run on top of React/Vue, so `rbac-fs/react` / `rbac-fs/vue` work as-is; only document SSR-specific guidance (snapshot must be fetched server-side and hydrated, never read from `.rbac/` files during SSR render) |

All frontend adapters sit on top of the single `RBACClient` (browser core,
§7) — same rule as backend: adapters are thin, no duplicated logic. Priority
order: **React → Vue → Angular → Svelte** (matches combined market share).

**Vanilla JS / no-framework:** `RBACClient` itself is usable directly with
zero adapter — this covers any framework not explicitly listed (Alpine.js,
jQuery-based legacy apps, etc.) without needing a dedicated package.

```typescript
interface StorageAdapter {
  loadRole(tenantId: string | null, roleName: string): Promise<RoleDefinition>;
  loadAllRoles(tenantId: string | null): Promise<RoleDefinition[]>;
  saveRole(tenantId: string | null, role: RoleDefinition): Promise<void>;
  deleteRole(tenantId: string | null, roleName: string): Promise<void>;
  appendLog(tenantId: string | null, roleName: string, entry: AuditEntry): Promise<void>;
  watch?(tenantId: string | null, callback: (event: ChangeEvent) => void): () => void;
}
```

v1 ships exactly one implementation: `LocalJsonAdapter`. Because everything routes
through this interface, a `PostgresAdapter` or `RemoteApiAdapter` can be added in a
later major version **without changing the public `RBAC` class API**.

---

## 4. `.rbac/` Folder Structure

```
.rbac/
├── tenants/
│   ├── acme-corp/
│   │   ├── roles/
│   │   │   ├── admin.json
│   │   │   ├── manager.json
│   │   │   └── viewer.json
│   │   └── logs/
│   │       ├── admin.jsonl
│   │       ├── admin.jsonl.1.gz     ← rotated + compressed
│   │       ├── manager.jsonl
│   │       └── viewer.jsonl
│   └── globex-inc/
│       ├── roles/...
│       └── logs/...
└── _shared/
    ├── roles/
    │   └── system-admin.json         ← cross-tenant / platform-level roles
    └── logs/
        └── system-admin.jsonl
```

**Path resolution priority (highest wins):**
1. Explicit: `new RBAC({ dataDir: '/custom/path' })`
2. Env var: `RBAC_DATA_DIR`
3. Auto-detect: nearest `package.json` folder → `.rbac/` inside it
4. Fallback: `process.cwd()/.rbac`

**Initialization strategy:** lazy init on first `RBAC` instantiation/use —
**not** a `postinstall` script. Postinstall scripts are increasingly flagged by
security scanners and blocked in enterprise environments; lazy init keeps the
package "clean" for supply-chain audits while producing identical end-user behavior.

---

## 5. Data Schemas

### 5.1 Role file (`roles/<role>.json`)

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
  "meta": {
    "createdAt": "2026-08-10T10:00:00Z",
    "updatedAt": "2026-08-10T10:00:00Z",
    "createdBy": "chintan"
  }
}
```

### 5.2 Audit log entry (one JSON object per line, `logs/<role>.jsonl`)

```json
{"ts":"2026-08-10T10:15:00Z","user":"chintan","role":"manager","action":"invoice:approve","resource":"inv-4521","result":"allow","tenantId":"acme-corp"}
```

Rationale for JSONL over YAML/JSON-array for logs: a corrupted line only breaks
that one record (parser skips and continues); a single JSON array or YAML document
that gets corrupted mid-write (crash, power loss) can make the entire log unreadable.

---

## 6. Log Rotation (solves the "file size will keep growing" concern)

Use `rotating-file-stream` under the hood, one stream per `(tenantId, role)` pair.

```typescript
{
  rotation: {
    maxSize: '5MB',     // rotate current file at 5MB
    maxAge: '90d',      // auto-delete rotated files older than 90 days
    compress: 'gzip',   // rotated files compressed automatically
    maxBackups: 12      // keep at most 12 rotated files per role
  }
}
```

Defaults should be conservative and overridable via `RBAC` constructor config.
Document clearly that `maxAge` should respect any compliance requirement the
consumer has (some regulations require longer minimum retention — don't silently
delete without making this configurable).

---

## 7. Public API (Core)

```typescript
const rbac = new RBAC({ tenantId: 'acme-corp' }); // tenantId optional → _shared/

// Permission check
await rbac.can(user, 'invoice', 'approve');
await rbac.can(user, 'report', 'view', { owner_id: user.id }); // condition context

// Role management (dynamic — this is the "can users create roles?" answer)
await rbac.createRole('supervisor', { inherits: ['viewer'] });
await rbac.grant('supervisor', { resource: 'invoice', actions: ['view', 'approve'] });
await rbac.revoke('supervisor', { resource: 'invoice', actions: ['approve'] });
await rbac.deleteRole('supervisor');
await rbac.listRoles();

// Audit
await rbac.getAuditLog('manager', { since: '2026-08-01' });
```

Frontend (browser build) — read-only, snapshot-based, no filesystem:

```typescript
import { RBACClient } from 'rbac-fs/client';

const client = new RBACClient(snapshotFromApi); // snapshot = resolved permissions for current user
client.can('invoice', 'approve'); // synchronous, in-memory only
```

Dual build via `package.json` conditional `exports`:

```json
"exports": {
  ".": {
    "node": "./dist/node/index.js",
    "browser": "./dist/browser/index.js",
    "default": "./dist/browser/index.js"
  },
  "./client": "./dist/browser/client.js"
}
```

---

## 8. Security / Validation Guardrails (build these into core, not left to consumers)

1. **Path/ID sanitization** — `tenantId` and `roleName` must match `^[a-zA-Z0-9_-]+$`.
   Reject anything else before it touches `path.join()` — prevents path traversal
   (`../../etc`) from a malicious or buggy tenantId.
2. **Schema validation on write** — validate incoming role objects (Zod or equivalent)
   before writing to disk: valid resource/action names, no unknown fields.
3. **Reserved names** — block accidental overwrite of system roles (e.g. `admin`,
   `system-admin`) unless an explicit `force` flag is passed.
4. **Circular inheritance detection** — on `createRole`/`grant`, walk the `inherits`
   chain and reject if it would create a cycle (A inherits B inherits A).
5. **Authorization on role management itself** — role CRUD operations should
   themselves be permission-checked in the consumer's app (e.g. `role:create`
   permission) — document this clearly in README with a code example, since the
   package cannot enforce this at the framework layer by itself in v1.

---

## 9. Phased Roadmap

| Phase | Deliverable |
|---|---|
| v0.1 | Core engine + `LocalJsonAdapter`, `can()`, role hierarchy resolution, PathResolver (tenant-aware), TypeScript source with dual CJS+ESM+`.d.ts` build so JS and TS consumers both work from v0.1 onward |
| v0.2 | `createRole` / `grant` / `revoke` / `deleteRole` with validation guardrails (§8) |
| v0.3 | JSONL audit logging + rotation (`rotating-file-stream` integration) |
| v0.4 | Browser build + `RBACClient` snapshot API + dual `exports` config |
| v0.5 | File watcher (chokidar) for live-reload when roles edited manually |
| v0.6 | Backend adapters batch 1: NestJS (`@RequirePermission()` + Guard), Express (middleware) |
| v0.7 | Frontend adapters batch 1: React (`<Can>` + hook), Vue (directive + composable) |
| v0.8 | Backend adapters batch 2: Fastify (plugin, JSON Schema integration), Koa (middleware) |
| v0.9 | Frontend adapters batch 2: Angular (directive + service), Svelte (store + action) |
| v1.0 | Stable API freeze, full test suite, docs site, npm publish with trusted publishing |
| v1.1 (future, non-breaking) | Backend adapters batch 3: Hapi, Hono (edge/serverless — snapshot-mode only) |
| v1.x (future, non-breaking) | `PostgresAdapter` / `RemoteApiAdapter` implementing the same `StorageAdapter` interface |

**Why adapters are safe to add later without breaking anything:** because of
the rule in §3.1 (adapters never contain logic, only translation), adding a
new framework adapter is purely additive — it cannot force a change to the
Core Engine's public API or to already-shipped adapters. This is what makes
"support every popular framework" achievable incrementally instead of a
big-bang requirement before v1.0.

---

## 10. Testing Strategy

- Unit: role resolution/inheritance, permission evaluation, path sanitization,
  circular-inheritance detection — pure functions, no fs
- Integration: `LocalJsonAdapter` against a temp `.rbac/` dir — create/read/update/delete
  roles, verify file contents match schema
- Rotation test: force writes past `maxSize`, assert rotation + compression happens
  and old files respect `maxBackups`
- Multi-tenant isolation test: assert tenant A's adapter calls can never read/write
  tenant B's folder, including adversarial tenantId inputs (path traversal attempts)
- Browser build smoke test: bundle with Vite/Webpack, assert no `fs`/`path` node
  built-ins leak into the bundle

---

## 11. npm Publishing Plan

- **Single package publish** — `rbac-fs` is one npm publish, one version number,
  even though internally it's a monorepo with a subpath per adapter. No separate
  `npm publish` runs per adapter, no version-drift risk between core and adapters.
- TypeScript → dual CJS+ESM build per subpath, `.d.ts` types shipped per subpath
  (see §2.1) — build tooling (tsup or a custom Rollup config) must emit the full
  `dist/core`, `dist/client`, `dist/adapters/*` tree from the single `src/` monorepo
  before publish; a `build` step failure on ANY subpath should block publish.
- `.npmignore` / `files` field in `package.json`: exclude `src/`, tests, docs — ship
  only `dist/`, README, LICENSE, CHANGELOG. Keep `dist/` lean per subpath so a
  Node-only consumer isn't forced to download React/Vue/Angular adapter code
  (small either way since adapters are thin per §3.1, but still good hygiene).
- **Trusted Publishing via GitHub Actions** (no long-lived npm tokens) — provenance
  attestation generated automatically, gives the npm listing a verified-build badge
- Semantic versioning strictly enforced; use Changesets for automated version bump +
  changelog + publish on merge to main — a single version number covers the whole
  package (core + every adapter), so a breaking change in one adapter still bumps
  the major version for everyone, which is intentional and simpler to reason about
  than independent adapter versioning
- CI matrix: build + test the package once in plain **JavaScript consumer mode**
  (a `.js` fixture project that only does `require('rbac-fs')` / `import ... from`,
  no TypeScript in that fixture) alongside the normal **TypeScript consumer mode**
  fixture — this is the automated guardrail that JS support (§2.1) doesn't silently
  regress in a future release.
- README: quick start (install → first `can()` call in under 10 lines) shown in
  **both** a `.js` and a `.ts` snippet side by side, comparison table vs
  Casbin/AccessControl/CASL, multi-tenant example, rotation config example, and a
  table of every `rbac-fs/<subpath>` import with one-line description
- Post-launch distribution: dev.to/Medium launch post, GitHub topics (`rbac`,
  `authorization`, `nestjs`, `multi-tenant`), reuse jsdoc-scribe's `gen-docs` for the
  documentation site once core API stabilizes

---

## 11.1 Where Validation Happens — Summary Table

This directly answers "jaha validation hona chahiye": every validation rule
lives in exactly one place — the Core Engine — regardless of which framework
or which side (backend/frontend) is calling it.

| Validation | Layer | Why here, not in adapters |
|---|---|---|
| tenantId / roleName sanitization (path traversal) | Core Engine, `LocalJsonAdapter` | Filesystem access only happens here; adapters never touch paths |
| Role schema validation (Zod) | Core Engine, on every `createRole`/`grant` | Must apply no matter which framework/UI triggered the write |
| Circular inheritance check | Core Engine | Structural rule of the role graph, framework-independent |
| Permission evaluation (`can()`) | Core Engine | Single source of truth — every adapter calls into this, never re-derives it |
| "Who is allowed to manage roles" | Consumer's app code, enforced by calling `core.can()` before role-mutation calls | This is a business rule of the consuming app (which role can manage roles), not a package concern — the package exposes the primitive, the app decides the policy |
| Framework request/response translation (403 vs throw vs `ctx.status`) | Adapter only | This is presentation-layer, genuinely framework-specific, correctly lives in the adapter |

## 12. Open Decisions (confirm before/at start of implementation)

1. ~~Final package name~~ — **decided: `rbac-fs`** ✅
2. Should `_shared/` roles be inheritable by tenant roles, or fully separate namespaces?
3. Tenant provisioning: does the package expose `rbac.createTenant()`, or does the
   consuming app just create the folder and the package discovers it?
4. Minimum supported Node version (affects whether native `fs.promises` APIs alone
   suffice or a polyfill layer is needed)
