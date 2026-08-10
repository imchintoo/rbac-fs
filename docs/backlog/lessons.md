# Lessons

Running log of corrections and the rules derived from them. Owned by
tech-lead (see `CLAUDE.md` → Self-Improvement Loop).

**How to add an entry:** whenever a ticket gets sent back for a correction,
append one entry below. Keep it short and rule-shaped — a sentence on what
went wrong, a sentence on the rule that prevents it next time. Don't write a
narrative of the incident.

**How to use this file:** at the start of each sprint/session, tech-lead
skims active entries relevant to current work before assigning tickets.
Recurring entries (same category showing up 2+ times) get flagged to
engineering-manager as retro input — that's a process gap, not just a
one-off fix.

---

## Format

```
### YYYY-MM-DD — <short title>
- **Role:** backend-engineer | frontend-engineer | qa-automation-engineer | tech-lead | ...
- **What happened:** one sentence, factual, no blame.
- **Rule going forward:** one sentence, imperative, checkable.
- **Status:** active | resolved (stop tracking once the pattern stops recurring)
```

---

## Entries

### 2026-08-10 — dataDir auto-detection needs fs, so it can't live in core/
- **Role:** solutions-architect
- **What happened:** `adr-v0.1-core-engine.md` originally placed `path-resolver.ts`
  (dataDir priority resolution, §4) under `src/core/`, but "auto-detect
  nearest `package.json`" requires walking the filesystem — that's
  inherently Node-only, so it can't live in the isomorphic Core Engine
  alongside pure identifier sanitization. Caught during implementation, not
  design review.
- **Rule going forward:** when an ADR assigns a module to `core/`, check
  whether *every* function in it can run with zero fs/path access — if even
  one function needs disk access, split it: put the fs-touching piece
  (dataDir resolution) inside the adapter that will actually use it, keep
  only the pure piece (identifier validation) in `core/`. Verify the split
  with a grep for `fs`/`path` imports outside `adapters/` before calling an
  ADR done, not just by eyeballing the module tree.
- **Status:** resolved — implemented as `core/identifier.ts` (pure) +
  `adapters/local-json-adapter.ts::resolveDataDir` (fs-dependent), verified
  by `grep -rn "from 'node:fs\|from 'node:path'" src/core/ src/index.ts`
  returning no matches.

### 2026-08-10 — tsup's `bundle-require` temp-file step can EPERM in this sandbox's mounted folder
- **Role:** backend-engineer
- **What happened:** `npx tsup` (relying on `tsup.config.ts`) failed with
  `EPERM: operation not permitted, unlink 'tsup.config.bundled_*.mjs'` —
  the sandbox's mounted connected-folder filesystem doesn't reliably allow
  a freshly-written temp file to be unlinked by a bash process (separate
  from the documented connected-folder delete restriction that needs
  `allow_cowork_file_delete` — this one is `bundle-require`'s own internal
  cleanup, hit even before any user-facing delete attempt).
- **Rule going forward:** for a single-entry-point package (no need for
  tsup's programmatic config features yet), skip `tsup.config.ts` entirely
  and call `tsup` with CLI flags directly in the `build` npm script — avoids
  the config-bundling step altogether. Revisit only if/when the build
  legitimately needs config-file-only features (e.g. multiple entries with
  per-entry options).
- **Status:** active — watch for this recurring once v0.6+ adapters need a
  real multi-entry tsup config; if it recurs, try building from `dist/`
  co-located outside the connected folder instead of working around
  `bundle-require` again.

### 2026-08-10 — self-referential `inherits` hit the wrong guard first
- **Role:** backend-engineer
- **What happened:** `createRole('self', { inherits: ['self'] })` should be
  a `CircularInheritanceError`, but `createRole`'s parent-existence check
  ran before the cycle check and called `adapter.loadRole(tenantId,
  'self')` for a role that doesn't exist on disk yet (it's mid-creation) —
  so it threw `RoleNotFoundError` instead. Caught by a QA test written in
  the same pass, not a separate review cycle, but the pattern is real:
  when a new entity can reference itself, an "existence" check that runs
  before the "not-a-cycle" check will misfire on the self-reference case
  specifically.
- **Rule going forward:** when validating a graph-mutation input (anything
  with `inherits`/`parent`/`dependsOn`-shaped fields) against an entity
  that doesn't exist yet, explicitly skip self-references in any
  existence-check loop and let the cycle detector — which already knows
  about the hypothetical entity — report it. Don't rely on existence
  checks and cycle checks being order-independent; they aren't when the
  entity being validated can be its own reference.
- **Status:** resolved.

### 2026-08-10 — rotating-file-stream's custom-generator mode has undocumented-in-practice gaps
- **Role:** backend-engineer
- **What happened:** two real bugs, both only visible by actually running
  the library, not by reading its README section-by-section: (1) its
  bookkeeping "history" file defaults to `<role>.jsonl.txt`, which our own
  `<role>.jsonl.*` glob (used by both `loadAuditLog` and the maxAge prune
  sweep) matched, corrupting reads/prunes with a non-JSONL file; (2) the
  README's "v3 auto-appends `.gz`" claim turned out to apply only to the
  library's *own* default filename generator — with a custom generator
  function (which we need, to match `docs/PLAN.md` §4's exact naming), the
  library does **not** add `.gz` on our behalf; the returned name IS the
  compressed file's destination path verbatim.
- **Rule going forward:** for any storage-format claim in a dependency's
  docs, write a throwaway script that actually exercises the code path
  (here: create a real stream, force real rotations, inspect real files —
  not just read the README) before relying on it in the ADR or the
  implementation. This is the same category of lesson as
  "adr-v0.1-core-engine.md"'s module-boundary correction: verify against
  running code, not documentation prose, especially for a dependency's
  edge-case behavior (custom generators, in this case) that the docs don't
  call out as different from the common case.
- **Status:** resolved — fixed with an explicit dot-prefixed `history`
  filename and self-appending `.gz` in the generator when compression is
  on.

### 2026-08-10 — shared test fixtures + auto-logging can()  made a test order-dependent
- **Role:** qa-automation-engineer
- **What happened:** `rbac.test.ts`'s integration tests share one `tmp`
  `.rbac/` fixture directory (module-level `before()`), and several tests
  call `can()` against the same `tenantId`/role (`acme-corp`/`manager`).
  Once v0.3 made every `can()` call write an audit entry, those tests'
  entries silently accumulated in the same `logs/manager.jsonl` — a new
  test asserting `getAuditLog('manager').length === 2` got `5` instead,
  because three earlier tests' `can()` calls were still sitting in the same
  log file.
- **Rule going forward:** once a feature makes `can()`/similar hot-path
  calls have a side effect (logging, now; maybe metrics later), any shared
  test fixture that multiple tests call that method against needs either a
  fresh role/tenant per test or an explicit isolation boundary — don't
  assume a fixture that was side-effect-free when written stays that way
  as new features land. Grep for reused role/tenant names across a test
  file when adding a feature with a new side effect.
- **Status:** resolved — the new test uses its own role (`auditee`)
  instead of the shared fixture's `manager`.

### 2026-08-10 — chokidar watchers hang the process; rotating-file-stream streams didn't, and that difference wasn't obvious in advance
- **Role:** backend-engineer
- **What happened:** adding default-on chokidar watchers (v0.5, for live-
  reload) made `npm test` hang indefinitely — every earlier test that
  constructed `new RBAC({...})` (public wrapper, no explicit adapter) or a
  bare `new LocalJsonAdapter(...)` without calling the v0.3-introduced
  `close()` had been silently fine until now, because rotating-file-stream
  write streams don't keep the Node event loop alive when idle, but a
  chokidar `fs.watch()`-backed watcher categorically does — an OS-level
  handle that's *supposed* to keep listening indefinitely. The same
  "resource needs `close()`" pattern from v0.3 had a materially different
  blast radius once the resource type changed from a stream to a watcher.
- **Rule going forward:** when adding a new kind of long-lived OS resource
  (watcher, socket, timer) to an adapter, don't assume the existing
  `close()`-discipline test coverage is sufficient just because a
  structurally similar resource (a stream) was added before without
  causing hangs — grep every test file for constructions of the
  resource-owning class and verify each either closes it or uses a fake/
  in-memory substitute, *before* considering the feature done. Also: a
  class that opens closeable resources but exposes no way to close them
  when the public API wraps/hides the resource-owning object internally
  (here, `RBAC`'s public wrapper auto-creates a `LocalJsonAdapter` a
  consumer can never reach) is an API gap, not just a test gap — fixed by
  adding `RBAC.close()` as a passthrough (`StorageAdapter.close?()`,
  optional, same pattern as `watch`/`loadAuditLog`), which is a real
  capability every consumer needed, not a test-only workaround.
- **Status:** resolved — `RBAC.close()` added; all real-adapter test
  constructions across `test/` now close what they open (tracked via a
  `makeAdapter()` helper + `after()` hook in `local-json-adapter.test.ts`
  where 13 call sites made per-test `try/finally` impractical).

### 2026-08-10 — esbuild (tsup's bundler) silently drops NestJS's `design:paramtypes` DI metadata
- **Role:** backend-engineer (rbac-fs/nestjs adapter, v0.6)
- **What happened:** `RbacGuard`'s constructor took `reflector: Reflector`
  with no explicit `@Inject()` token, relying on Nest's normal ability to
  resolve a constructor param from its TS type alone (works via
  `emitDecoratorMetadata`'s `design:paramtypes` output). That works
  correctly against `src/` in this repo's own tsc-based typecheck/test run
  — but the *published* package is built by `tsup`, which uses `esbuild`,
  and esbuild only emits that metadata if the optional `@swc/core` plugin
  is installed (it isn't, and adding a second compiler toolchain just for
  this wasn't judged worth it). Caught by inspecting the actual built
  `dist/adapters/nestjs/index.js` output after `npm run build` — no
  `Reflect.metadata('design:paramtypes', ...)` call was present — not by
  the test suite, since tests exercise `src/` directly via `tsx`/tsc.
- **Rule going forward:** for any adapter using a framework's DI/reflection
  based on implicit type inference (NestJS constructor injection without
  explicit tokens being the concrete case here), don't trust that
  behavior verified against `tsc`-compiled `src/` also holds for the
  `tsup`/`esbuild`-compiled `dist/`. Grep the actual built output for the
  runtime evidence the framework needs (here: `design:paramtypes`
  metadata) whenever a feature depends on a compiler emitting something
  beyond straightforward syntax transpilation — same category as the
  rotating-file-stream lesson above (verify against the real built
  artifact, not the toolchain's documented/assumed behavior).
- **Status:** resolved — every `RbacGuard` constructor param now has an
  explicit `@Inject()` token (`@Inject(Reflector)`, `@Inject(RBAC_TOKEN)`),
  which sidesteps implicit-type-based resolution entirely rather than
  fixing the build to emit the metadata. Regression-tested by spinning up
  a real `Test.createTestingModule` (not a hand-built `ExecutionContext`)
  in `test/nestjs-adapter.test.ts` to prove Nest's actual DI container
  constructs `RbacGuard` correctly.

### 2026-08-10 — a runtime-imported package needs peerDependency status, not just devDependency, or tsup tries to bundle its optional peers too
- **Role:** tech-lead (v0.6 shared scaffolding)
- **What happened:** `@nestjs/core` (source of `Reflector`, imported at
  runtime by `rbac-fs/nestjs`) was initially classified as devDependency-
  only, same as `express`/`@nestjs/testing` (needed only for typecheck/
  test, never imported by shipped adapter code at runtime). That
  classification is wrong specifically for `@nestjs/core`: because it's
  actually imported by `src/adapters/nestjs/index.ts`, `tsup`/`esbuild`
  tried to bundle it (esbuild only auto-externalizes packages listed in
  `dependencies`/`peerDependencies`, not `devDependencies`) — and bundling
  `@nestjs/core` pulled in its own internal, optional `require()` calls for
  `@nestjs/microservices`/`@nestjs/platform-express`/`@nestjs/websockets`,
  none of which are installed (correctly — this adapter needs none of
  them), which esbuild can't resolve, failing the build outright. Caught by
  actually running `npm run build`, not by typecheck (which passed fine —
  TS type-only resolution doesn't care how a package will be bundled).
- **Rule going forward:** the dependency-classification question for an
  adapter isn't "is this a dev tool or a runtime need" (that's necessary
  but not sufficient) — it's "does any adapter source file `import` a
  runtime value (not just a type) from this package." If yes, that package
  needs to be a `peerDependency` (optional, per §5's pattern) so the
  bundler externalizes it instead of trying to inline it — a devDependency
  classification is only correct for packages used purely for typecheck/
  test (types, or test-harness-only imports like `@nestjs/testing`). Verify
  by actually running the build after adding any new adapter dependency,
  not by typecheck alone — the two catch different failure classes.
- **Status:** resolved — `@nestjs/core` moved to `peerDependencies`
  (optional), alongside `@nestjs/common`/`express`.

### 2026-08-10 — sandbox's npm (10.9.8 on Node 22.22.3) has a reproducible arborist crash on this dependency graph; pnpm used as a one-time install workaround
- **Role:** tech-lead (v0.7 shared scaffolding)
- **What happened:** once v0.7's `react`/`vue`/`@types/react`/
  `@types/react-test-renderer` devDependencies were added on top of v0.6's
  set, every `npm install` (fresh `node_modules`, fresh cache, `--omit=
  optional`, different npm patch versions via `npx npm@10.9.3`) crashed
  identically: `TypeError: Invalid Version:` inside `@npmcli/arborist`'s
  `Node.canDedupe` while placing `fsevents` (a transitive optional dep of
  `tsx`, irrelevant on this Linux sandbox). Not a project misconfiguration
  — confirmed by the crash surviving a fully clean `node_modules` +
  `package-lock.json` + npm cache wipe, and reproducing with
  `--package-lock-only` (no reification needed to trigger it). This is an
  environment-specific npm/Node version bug, not a bug in `rbac-fs`'s
  `package.json`. Worked around by installing with `pnpm` instead (which
  resolved the same graph without issue) purely to populate `node_modules`
  for this sandbox session's typecheck/test/build runs.
- **Rule going forward:** `npm` stays the project's canonical package
  manager (per `docs/PLAN.md` §11's single-npm-publish plan) — pnpm was
  never adopted as a project dependency; no `pnpm-lock.yaml`/
  `pnpm-workspace.yaml`/pnpm-specific `.npmrc` entries were committed.
  `package-lock.json` in this commit was **not** regenerated against the
  final v0.7 dependency set (regenerating it hits the same npm crash in
  this sandbox) — it reflects the pre-v0.7 dependency set. Whoever runs
  the next real `npm install` in a normal (non-sandboxed) environment will
  regenerate it correctly against `package.json`'s ranges automatically;
  flagging here so it isn't mistaken for an intentional omission. If this
  crash recurs in a real CI environment (not just this sandbox), it's
  worth an isolated repro against `@npmcli/arborist` upstream — the
  trigger (`fsevents` optional-dep dedup against a large peer/dev
  dependency set spanning `@nestjs/*` + `react`/`vue`) is specific enough
  to be worth a filed issue rather than a permanent pnpm switch.
- **Status:** active — revisit `package-lock.json` regeneration next time
  this repo is opened in a normal (non-sandboxed) dev environment.

### 2026-08-10 — a plain Fastify plugin's addHook() doesn't reach sibling routes; needs fastify-plugin to break encapsulation
- **Role:** backend-engineer (rbac-fs/fastify adapter, v0.8)
- **What happened:** `rbacPlugin` was designed and implemented as a plain
  `async (fastify, opts) => { fastify.addHook('onRequest', ...) }`
  function, on the reasoning that wrapping it in `fastify-plugin` would be
  an unnecessary dependency for "thin translation." QA wrote a real
  Fastify app + real routes (not a mock) to test it and got `200` instead
  of the expected `403` for a denied user. Root cause, confirmed with a
  throwaway debug script exercising real Fastify encapsulation directly:
  a plugin's `addHook()` call only applies within that plugin's own
  encapsulated child context — a route registered on the parent `app` as a
  sibling *after* `app.register(rbacPlugin, ...)` (the exact usage shown
  in the adapter's own ADR code example, and the overwhelmingly common
  real-world shape) is not a descendant of that context, so the hook
  silently never runs for it. The bug wasn't in the permission-check logic
  at all — it was in whether the hook ever executed.
- **Rule going forward:** for any framework whose plugin/middleware system
  has an encapsulation or scoping concept (Fastify's plugin contexts being
  the concrete case here), don't design a "should apply globally" hook
  against the framework's own docs/mental-model alone — write a minimal
  real app exercising the exact registration shape the adapter's own
  usage example shows (plugin registered once at the root, routes declared
  as normal siblings elsewhere) and confirm the hook actually fires before
  trusting the design. This is the same category as `docs/backlog/
  adr-v0.3-audit-logging.md`'s rotating-file-stream lesson and v0.6's
  `design:paramtypes`/`@nestjs/core` findings: verify against running
  code, not framework documentation or "should work" reasoning, especially
  for a framework's encapsulation/lifecycle semantics that aren't obvious
  from the public API surface alone.
- **Status:** resolved — `rbacPlugin` wrapped in `fastify-plugin`'s `fp()`,
  which explicitly opts out of encapsulation for exactly this "hook must
  apply app-wide" case (the same tool `@fastify/jwt`/`@fastify/auth` use
  internally). Regression-tested in `test/fastify-adapter.test.ts` by
  registering the plugin once and declaring routes as real siblings
  afterward — the shape that silently failed before the fix.
