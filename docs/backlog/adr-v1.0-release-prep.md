# ADR: v1.0 — Release Readiness (API Freeze, Docs, CI/Publish)

status: approved
owner: solutions-architect
created: 2026-08-10
story: story-v1.0-release-prep.md
plan-ref: "docs/PLAN.md §7, §10, §11, §11.1"

## Decision

### 1. API freeze audit — findings
Read every export across `src/index.ts`, `src/client/index.ts`, and all
eight adapter entries against §7/§11.1. Findings:
- Naming is consistent: every backend adapter's public function is a
  verb-shaped factory (`rbacMiddleware`, `rbacPlugin`) or a
  decorator/provider pair; every frontend adapter follows the
  `usePermission()`/`can`-action/`*rbacCan` naming already established by
  v0.7's precedent, extended consistently through v0.8/v0.9.
- Error handling is consistent: every `RbacError` subclass is exported
  from the root entry (`src/index.ts`), none are adapter-specific — an
  adapter never needs its own error type because §3.1's rule (adapters
  never contain logic) held for all eight adapters without exception.
- One real gap found: `RBACClient` (browser) has no equivalent of
  `RBAC.close()` — correctly so (it's synchronous, in-memory, holds no OS
  resource), but this is worth stating explicitly in the README (§11's
  deliverable) so a consumer coming from the Node side doesn't go looking
  for a cleanup method that doesn't need to exist. Not a code change.
- No breaking changes identified. **v1.0's public API is the union of
  everything shipped v0.1–v0.9, unchanged.**

### 2. README structure
Single root `README.md` (not a docs site — see story's deferral). Sections,
in order: positioning line (§2) → comparison table (§2) → install →
quick start (`.js` then `.ts`, both under 10 lines, both actually run
against the built `dist/` before being considered done, per story success
metric) → multi-tenant example → rotation config example → subpath import
table (nine rows — `.`, `./client`, `./express`, `./nestjs`, `./fastify`,
`./koa`, `./react`, `./vue`, `./angular`, `./svelte` — ten, not nine;
story text undercounted, corrected here) → security guardrails summary
(§8, condensed) → license.

### 3. CHANGELOG.md — retroactive seed
One entry per shipped phase (v0.1 through v0.9), sourced from each
`docs/backlog/task-v0.X-*.md`'s status log (already the authoritative
record of what shipped, per phase). Keep a Changelog format
(`## [0.9.0] - 2026-08-10` style headers), grouped `### Added` per version
— every phase so far has been purely additive (§9's "why adapters are
safe to add later" claim holds), so no `### Changed`/`### Removed`
sections are needed for v0.1–v0.9.

### 4. CI workflow design
Two workflow files:
- `.github/workflows/ci.yml` — runs on every push/PR: `npm run verify`
  (already the single source of truth for typecheck+test+build+both smoke
  tests) plus two new fixture jobs:
  - **JS-consumer-mode**: a throwaway fixture directory with a plain
    `.js` file doing `require('rbac-fs')`/`import` against the built
    `dist/` (functionally what `test/dist-smoke.mjs` already does in-repo
    — the CI job's value-add is running it in a clean environment via
    `npm pack` + install from the tarball, catching "works in the repo but
    the published tarball is missing a file" class bugs `dist-smoke.mjs`
    alone can't catch since it runs against the repo's own `dist/`, not a
    packed-and-reinstalled artifact).
  - **TS-consumer-mode**: same idea, a `.ts` fixture with its own
    `tsconfig.json` importing `rbac-fs`, run through `tsc --noEmit` to
    prove the shipped `.d.ts` files typecheck standalone (not just inside
    this repo's own `tsconfig.json` context).
- `.github/workflows/publish.yml` — triggers on a GitHub Release being
  published (not on push to main), uses `id-token: write` permission +
  npm's `--provenance` flag (Trusted Publishing / OIDC — no `NPM_TOKEN`
  secret stored in the repo, per §11). This workflow is **configuration
  only** in this story — it has never been run, per the story's explicit
  deferral of actually publishing.

### 5. `package.json` changes
- `publishConfig.provenance: true` added.
- `files` field re-verified: already `["dist", "README.md", "LICENSE"]` —
  correct, no change needed (§11's "exclude src/, tests, docs" already
  satisfied since v0.1).
- `version` stays `0.1.0` in this story (see story §5's explicit
  reasoning) — Changesets (already named in §11 as the intended tool) owns
  the actual version-bump-on-publish step, which is part of the deferred
  "actually publish" action, not this story.

### 6. Test-coverage audit against §10 — findings
Confirmed via direct inspection of existing `test/` files (not re-derived
from memory):
- Role resolution/inheritance: `test/role-resolver.test.ts` (7 tests —
  linear chains, diamond inheritance, direct + indirect cycles, missing
  roles).
- Path sanitization: `test/identifier.test.ts` (explicit "rejects path
  traversal attempts" + "rejects empty string, dots, spaces, null bytes"
  cases).
- Circular-inheritance detection: covered in both `role-resolver.test.ts`
  and `rbac.test.ts`'s `createRole` self-reference case (the v0.2 lessons.md
  bug fix).
- Rotation: `test/local-json-adapter-audit.test.ts` (8 tests, v0.3).
- Multi-tenant isolation: `test/local-json-adapter.test.ts`'s "multi-tenant
  isolation: same role name, different tenants, different content" test,
  plus `identifier.test.ts`'s adversarial tenantId path-traversal cases
  (tenantId goes through the exact same `assertValidIdentifier` as
  roleName, so the path-traversal coverage applies to both).
- Browser-build smoke test: `test/browser-bundle-smoke.mjs` (v0.4,
  re-verified green after every adapter phase since).

**No coverage gaps found.** No new tests added by this story — confirmed
via audit, not assumed.

## Consequences
- The CHANGELOG's retroactive v0.1–v0.9 entries mean the first real
  publish (whenever the package owner triggers it) will show a complete
  history from day one, rather than starting mid-stream.
- The CI publish workflow being unexercised until a real release is
  created is a known, accepted gap — it will get its first real run at
  actual publish time, which is also when `package-lock.json` needs the
  regeneration flagged in `docs/backlog/lessons.md`'s 2026-08-10 npm/
  arborist entry.

## Approval status
**APPROVED — proceeding to tech-lead.**
