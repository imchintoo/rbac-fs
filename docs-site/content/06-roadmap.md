# Roadmap & CLI

What's shipped today vs. what's planned — so you never build against something that doesn't exist yet.

<div class="callout tip">Everything under "Shipped (v1.0.0)" is available in the current release. Everything under "Planned" is not published yet — treat it as roadmap, not as usable API.</div>

## Shipped (v1.0.0)

- Core Engine: `can()`, role hierarchy/inheritance resolution, `LocalJsonAdapter`
- Dynamic role management: `createRole` / `grant` / `revoke` / `deleteRole` / `listRoles`
- JSONL audit logging with automatic rotation
- Browser build: `RBACClient` snapshot API, dual Node/browser `exports`
- Live-reload via file watcher (`chokidar`)
- Feature-scoped permissions + composable `condition` tree (`and`/`or`/`not`, 12 operators, `custom` operator registry)
- 8 framework adapters: NestJS, Express, Fastify, Koa, React, Vue, Angular, Svelte

## Planned — not yet published

| Version | Deliverable | Status |
|---|---|---|
| v1.1 | CLI layer — `rbac-fs diff`, `explain`, `test` (file-only, no database) | Proposed roadmap, not an approved backlog item yet |
| v1.2 | `PostgresAdapter` — first database-capable `StorageAdapter`, plus `AdapterRouter` for per-tenant backend routing | Design approved, implementation not started |
| v1.3 | Sync Engine — `rbac-fs sync`, content-hash change detection | Design stage |
| v1.4 | `rbac-fs drift` — DB-vs-file divergence reporting | Design stage |
| v1.5 | `rbac-fs pull` — reverse export for migrating an existing DB-based setup | Design stage |
| v1.6 | `MongoDBAdapter`, `MySQLAdapter`, `SQLiteAdapter` | Design stage |
| v1.7+ | Hapi, Hono adapters (edge/serverless); `RemoteApiAdapter`; Redis as a read-through cache layer | Future, non-breaking |

## Why adapters are safe to add later without breaking anything

Every framework adapter is a thin translation layer — it extracts `(user, resource, action, context)` from a framework-specific request and calls the Core Engine's `can()`. No adapter re-implements validation or permission logic. That means adding a new adapter is purely additive: it cannot force a change to the Core Engine's public API or to any adapter already shipped.

## Why the CLI and DB adapters aren't "coming soon" hype

Each planned item above only ships once it has gone through the same product-owner → solutions-architect → tech-lead chain that shipped v0.1 through v1.0 (see this repo's `CLAUDE.md` and `docs/backlog/`) — the roadmap is a plan, not a promise with a date attached. If you need database-backed storage today, implement `StorageAdapter` yourself; the interface is stable and documented on the [API Reference](/docs/api-reference.html) page.
