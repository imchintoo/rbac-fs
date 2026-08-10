# Epic: rbac-fs v1.0 — Zero-DB, File-Based Multi-Tenant RBAC

status: approved
owner: product-owner
created: 2026-08-10
updated: 2026-08-10
plan-ref: "docs/PLAN.md — full spec"

## Problem statement

Teams that want role-based access control today either stand up a database
just to hold roles/permissions, or reach for a policy engine (Casbin,
AccessControl, CASL) whose config is an opaque blob rather than something a
reviewer can read in a PR diff. There's no package that gives zero-config,
git-friendly, multi-tenant RBAC that works the same way in a Node backend and
a browser frontend.

## Vision/intent

`npm install rbac-fs` → works immediately, no DB setup. Roles and permissions
live as human-readable JSON files under `.rbac/`, tenant-isolated by folder,
editable by hand or via the API, PR-reviewable like any other source file.
One package, subpath exports per framework adapter (`rbac-fs/express`,
`rbac-fs/react`, etc.), thin adapters that never duplicate Core Engine logic.
Full detail in `docs/PLAN.md`.

## Goals (docs/PLAN.md §1)
- Zero-config install, works immediately
- Human-readable, git-friendly JSON role/permission storage
- Multi-tenant from day 1, folder-isolated
- Audit logs with automatic rotation
- Works in Node (full read/write) and browser (read-only snapshot)
- Dynamic role/permission management at runtime
- Storage layer swappable later without breaking the public API

## Non-goals for v1 (docs/PLAN.md §1)
- No built-in database adapter (interface only)
- No shipped UI/admin panel
- No distributed/multi-server real-time sync

## Scope — phased roadmap (docs/PLAN.md §9)

| Phase | Deliverable | Depends on |
|---|---|---|
| v0.1 ✅ done | Core engine + `LocalJsonAdapter`, `can()`, role hierarchy resolution, tenant-aware PathResolver, dual CJS+ESM+`.d.ts` build | — |
| v0.2 ✅ done | `createRole`/`grant`/`revoke`/`deleteRole` + validation guardrails (§8) | v0.1 |
| v0.3 ✅ done | JSONL audit logging + rotation | v0.2 |
| v0.4 ✅ done | Browser build + `RBACClient` snapshot API + dual `exports` | v0.1 |
| v0.5 ✅ done | File watcher (chokidar) live-reload | v0.1–v0.3 |
| v0.6 ✅ done | Backend adapters batch 1: NestJS, Express | v0.2 |
| v0.7 ✅ done | Frontend adapters batch 1: React, Vue | v0.4 |
| v0.8 ✅ done | Backend adapters batch 2: Fastify, Koa | v0.2 |
| v0.9 ✅ done | Frontend adapters batch 2: Angular, Svelte | v0.4 |
| v1.0 ⏳ readiness done, publish pending | Stable API freeze, full test suite, docs site, npm publish (trusted publishing) | all above |

v1.1+ (Hapi, Hono, PostgresAdapter/RemoteApiAdapter) is explicitly deferred —
see `docs/PLAN.md` §9 for why adapters are safe to add non-breaking later.

## Success metrics
- ✅ `npm install rbac-fs` → first `can()` call working in under 10 lines, in
  both a `.js` and `.ts` fixture (README quick start, §11) — both actually
  executed against the real build, not just read.
- ✅ CI matrix green on both JS-consumer-mode and TS-consumer-mode fixtures
  — verified locally with the exact commands the workflow runs (packed
  tarball, fresh install, run) before the workflow was considered done.
- ✅ Multi-tenant isolation test suite passes, including adversarial
  path-traversal tenantId inputs (§10) — confirmed via audit, existing
  since v0.1.
- ✅ Browser bundle smoke test: zero `fs`/`path` Node built-ins leak into a
  Vite/Webpack bundle (§10) — unchanged (2790 bytes) through all nine
  adapter phases.
- ⏳ v1.0 published to npm with provenance attestation (trusted
  publishing, §11) — **deliberately not done by this pipeline.** Every
  prerequisite is ready (CI/publish workflow, README, CHANGELOG, clean
  `package.json`), but the actual `npm publish` / GitHub Release trigger
  is the package owner's call, not an autonomous engineering action — see
  `story-v1.0-release-prep.md`'s explicit deferral. Before triggering it:
  regenerate `package-lock.json` in a normal (non-sandboxed) npm
  environment (`docs/backlog/lessons.md`'s 2026-08-10 npm/arborist entry),
  then create a GitHub Release to fire `publish.yml`.

## Blocking open decisions (docs/PLAN.md §12) — RESOLVED
Resolved 2026-08-10 in `story-v0.1-core-engine.md`:
1. `_shared/` roles: fully separate namespaces by default (isolation-first).
2. `rbac.createTenant()` exposed AND lazy folder discovery both supported.
3. Minimum Node version: `>=20`.

## Next step
v0.1–v0.9 shipped, and v1.0's release-readiness work is done, all
2026-08-10 (see each phase's `story-*`/`adr-*`/`task-*` files). The public
API is frozen (no breaking changes across v0.1–v0.9), README + CHANGELOG
exist, and the CI/publish workflows are written and locally verified.

**What's left is entirely the package owner's, not this pipeline's:**
1. Regenerate `package-lock.json` in a normal (non-sandboxed) npm
   environment — see `docs/backlog/lessons.md`'s 2026-08-10 npm/arborist
   entry.
2. Configure npm Trusted Publishing for this repo/workflow on
   npmjs.com (one-time setup, done on the npm side, not in this repo).
3. Create a GitHub Release — that's what fires `.github/workflows/
   publish.yml` and actually publishes `rbac-fs@1.0.0` to the registry.

Once published, next up per `docs/PLAN.md` §9/§11.1: v1.1+ (Hapi, Hono,
`PostgresAdapter`/`RemoteApiAdapter` — all explicitly deferred, non-
breaking to add later) and the docs site (deferred in
`story-v1.0-release-prep.md` as its own cross-repo initiative reusing
jsdoc-scribe's `gen-docs`).
