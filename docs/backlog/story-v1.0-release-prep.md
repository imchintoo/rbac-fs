# Story: v1.0 — Stable API Freeze, Docs, CI/Publish Readiness

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-10
plan-ref: "docs/PLAN.md §9 (v1.0 row), §10 (testing strategy), §11 (npm publishing plan), §11.1 (validation summary table)"

## Problem statement
v0.1–v0.9 shipped the full engine, storage, audit, browser client, and all
eight framework adapters named in `docs/PLAN.md` §3.1. v1.0 per §9 is "Stable
API freeze, full test suite, docs site, npm publish with trusted publishing" —
a release-engineering phase, not a feature phase. Nothing in `docs/PLAN.md`
changes scope here; this story exists to make the release-readiness work
explicit and checkable, the same way every feature phase got its own story.

## Requirements (acceptance criteria)
1. **API freeze audit**: read every exported symbol from `src/index.ts`,
   `src/client/index.ts`, and all eight adapter entry points against
   `docs/PLAN.md` §7/§11.1, confirm nothing is accidentally half-finished
   or inconsistent (naming, optional params, error types) before calling
   it 1.0-stable. Document findings (even "no issues found") in the ADR.
2. **README** (repo root, currently missing) per §11's exact requirements:
   quick start in both `.js` and `.ts` (under 10 lines each per §11),
   comparison table vs Casbin/AccessControl/CASL (§2), multi-tenant
   example, rotation config example, a table of every `rbac-fs/<subpath>`
   import with a one-line description (nine rows: `.`, `./client`, and
   the seven — actually eight, see below — adapter subpaths).
3. **CHANGELOG.md** (currently missing) — seed it retroactively for
   v0.1–v0.9 from the backlog's `story-*`/`task-*` status logs (already
   the source of truth for what shipped each phase), in Keep a Changelog
   format, so the very first published version doesn't start with an
   empty history.
4. **CI matrix + trusted publishing workflow** (`.github/workflows/`,
   currently missing) per §11: a JS-consumer-mode fixture (plain
   `require()`/`import` against the built `dist/`, no TypeScript) and a
   TS-consumer-mode fixture, both run in CI; a publish workflow using
   npm's Trusted Publishing (OIDC, no long-lived `NPM_TOKEN` secret) that
   triggers on a tag/release, not on every push — this story delivers the
   **workflow configuration**, not an actual publish (see §5 below).
5. **`package.json` publish-readiness**: confirm `files` field stays
   lean (already `dist`/`README.md`/`LICENSE` — recheck against §11's
   "exclude src/, tests, docs"), add `publishConfig.provenance: true`, add
   a `repository.directory` field only if this ever becomes a true
   monorepo (it isn't — single package, skip). Do **not** bump `version`
   to `1.0.0` in this story — semver bump happens at actual publish time
   (Changesets-driven, per §11), and doing it prematurely here would claim
   a release that hasn't happened.
6. **Final `docs/PLAN.md` §10 test-coverage audit**: confirm (not
   re-derive) that role resolution/inheritance, path sanitization,
   circular-inheritance detection, rotation, and multi-tenant isolation
   (including adversarial tenantId path-traversal inputs) each have real
   test coverage already in `test/`. Add tests only for genuine gaps found
   — this is an audit story, not a rewrite.

## Explicitly out of scope / deferred (product-owner resolution, per
CLAUDE.md's "resolve or explicitly defer any open decision a story
touches")
- **Docs site** (`docs/PLAN.md` §11's "reuse jsdoc-scribe's gen-docs")
  — deferred to a post-v1.0 initiative. Reusing another project's
  generator is a cross-repo integration task with its own scoping needs
  (which parts of jsdoc-scribe's tool are reusable as-is vs. need
  adaptation) that doesn't fit inside this phase without under-scoping it.
  The README (requirement #2) is the complete v1.0 documentation
  deliverable; the docs site is real future work, not silently dropped.
- **Actually publishing to the public npm registry** — deferred to the
  package owner's explicit action, not something this pipeline executes
  autonomously. Publishing is irreversible (a version number, once
  published, can't be unpublished/reused) and is a business/ownership
  decision (npm account, org, timing) outside an engineering pipeline's
  authority — same category of judgment call as "never execute a trade"
  guidance for financial actions. This story delivers everything needed
  to publish (CI workflow, CHANGELOG, README, clean `package.json`) and
  stops there.
- **v1.1+ adapters** (Hapi, Hono, `PostgresAdapter`/`RemoteApiAdapter`) —
  already explicitly out of v1.0 per §9.

## Success metrics
- README exists, matches every §11 requirement, and its `.js`/`.ts` quick
  starts are verified to actually run (not just read plausibly) against
  the built `dist/`.
- CI workflow YAML is syntactically valid and its JS/TS fixture jobs are
  proven locally (the same commands the workflow runs, run by hand here)
  before considering the workflow "done" — a workflow file that's never
  been exercised isn't done, per this project's "verify, don't assume"
  standard from every prior phase's lessons.md entries.
- `npm run verify` still green (100% regression-free — this story touches
  no `src/` runtime code paths, only docs/config/CI).

## Approval status
**APPROVED — proceeding to engineering-manager.**
