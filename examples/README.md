# rbac-fs — examples

Every one of these is real, runnable code, executed against the actual
built `dist/` before being committed here (not hand-typed and assumed
correct) — see "How these were verified" below. Copy whichever file
matches your stack.

Run any `.mjs` file with `node examples/<file>.mjs`. Files ending in
`.ts` need `node --import tsx examples/<file>.ts` (or your project's own
TypeScript toolchain). Run `node examples/_selftest.mjs` first if
something doesn't behave as documented — it confirms the install itself
is sound before you debug your own code.

| File | Covers |
|---|---|
| `_selftest.mjs` | Confirms every documented export/subpath resolves — run this first if anything below misbehaves |
| `01-quickstart.mjs` | Smallest possible setup: `new RBAC()`, `createRole`, `can()` |
| `02-dynamic-role-management.mjs` | `createRole`/`grant`/`revoke`/`listRoles`/`deleteRole`, role inheritance, dependents guard |
| `03-conditional-grants.mjs` | `when` clauses — "user can approve their OWN report" instead of a blanket grant |
| `04-multi-tenant.mjs` | Tenant-isolated roles, `_shared/` cross-tenant roles, path-traversal rejection |
| `05-audit-logging.mjs` | JSONL audit log, rotation config, `getAuditLog({ since })` |
| `06-live-reload-watcher.mjs` | Hand-editing a role file on disk and having `can()` pick it up with no restart |
| `07-express-middleware.mjs` | `rbacMiddleware(rbac, resource, action, options?)` |
| `08-koa-middleware.mjs` | Same middleware shape, Koa's `ctx.state.user` convention |
| `09-fastify-plugin.mjs` | `rbacPlugin` + per-route `config: { rbac: {...} }` |
| `10-nestjs-guard.ts` | `@RequirePermission()` + `RbacGuard` + `provideRbac()` |
| `11-browser-client.mjs` | `RBACClient` — synchronous, in-memory, snapshot-based, no filesystem |
| `12-react-usage.tsx` | `<RbacProvider>` + `<Can I="..." a="...">` + `usePermission()` |
| `13-vue-usage.vue` (+ `-verify.mjs`) | `createRbacPlugin()` + `v-can` directive + `usePermission()` composable |
| `14-angular-usage.ts` | `provideRbacClient()` + `RbacService` + `*rbacCan` structural directive |
| `15-svelte-usage.svelte` (+ `-verify.mjs`) | `createPermissionStore()` (`$permissions`) + `createCanAction()` (`use:can`) |

## How these were verified

- **01–11 (`.mjs`/`10.ts`)** run directly against this package's real
  `dist/` build via Node's self-reference resolution (`import ... from
  'rbac-fs'`, exactly how a real consumer's `node_modules` resolution
  works) — every printed value in each file's comments is the actual
  output from running it, not a guess.
- **12 (React)** renders headlessly with `react-test-renderer` (no DOM
  needed) and prints the real rendered tree.
- **13 (Vue) / 15 (Svelte)** ship as the idiomatic `.vue`/`.svelte`
  component you'd actually write, paired with a `-verify.mjs` file that
  exercises the exact same composable/directive/action/store calls
  headlessly (no SFC compiler needed) against the real adapter + client.
- **14 (Angular)** drives `RbacService`/`RbacCanDirective` directly
  (no `TestBed`/real DOM) — the same approach this repo's own
  `test/angular-adapter.test.ts` uses — because a real `@Component`'s
  decorators need Angular's own compiler pipeline (`@angular/cli`'s
  builder), not a bare TypeScript-to-JS transpile. The copy-pasteable
  `@Component` code is inline as a comment block in that file.
- **10 (NestJS)** similarly drives `RbacGuard` directly with a real
  `Reflector` and a real (hand-built) `ExecutionContext` rather than
  booting a live Nest HTTP server, because Nest's own `@Post()`/
  `@Controller()` decorators need `design:paramtypes` metadata that only
  a real `tsc`/SWC-based Nest build emits — not `tsx`'s esbuild-based
  transpile (this is documented directly in
  `src/adapters/nestjs/index.ts`'s `RbacGuard` comment, and is why
  `RbacGuard` itself explicitly `@Inject()`s `Reflector` instead of
  relying on implicit type-based DI). The copy-pasteable
  `@Controller`/`@Module` code is inline as a comment block in that file.

In short: every line of *rbac-fs's own* logic shown here — role
resolution, conditions, every adapter's `can()` call-through — is
exercised for real. The only things not live-booted are two other
frameworks' own compiler-dependent decorators (Nest's, Angular's), which
is a constraint of this examples folder's zero-build-step demo runner,
not of rbac-fs itself.

## Data used by these examples

Examples 01–06 write to `.rbac/` in this package's own directory (same
default-resolution rule real consumers get — see the main README's
"Live-reload" section). That folder is git-ignored; delete it if you want
a clean slate before re-running.
