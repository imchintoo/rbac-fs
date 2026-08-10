# Task: v1.0 Release Readiness

status: done
owner: tech-lead
created: 2026-08-10
plan-ref: "docs/backlog/adr-v1.0-release-prep.md"
story: story-v1.0-release-prep.md

## Sequenced sub-items
No fan-out this phase — every ticket touches shared root-level files
(`README.md`, `CHANGELOG.md`, `package.json`, `.github/workflows/`), so
Subagent Fan-Out's independence test fails across the board; run
sequentially by role instead.

1. **backend-engineer**: `package.json` `publishConfig.provenance`, final
   `files` field re-check (no change expected per ADR §5).
2. **documentation** (doc-writing pass, tech-lead-assigned since there's
   no dedicated "technical-writer" role in the org chart — closest fit is
   backend-engineer wearing a docs hat, per CLAUDE.md's redirect-to-
   correct-role rule not applying here since no more specific role exists):
   `README.md` per ADR §2, verified by actually running both quick-start
   snippets against the built `dist/`.
3. **backend-engineer**: `CHANGELOG.md` per ADR §3, sourced from
   `docs/backlog/task-v0.*.md` status logs.
4. **devops-engineer**: `.github/workflows/ci.yml` + `publish.yml` per
   ADR §4 — CI workflow's fixture-job commands proven locally before the
   YAML is considered done (this repo's "verify, don't assume" standard
   applies to CI config the same as application code).
5. **qa-automation-engineer**: §10 coverage audit per ADR §6 (confirm
   only — findings already state no gaps), plus a final `npm run verify`
   regression pass.

## Acceptance
- README's `.js`/`.ts` quick starts both actually executed against built
  `dist/`, not just read for plausibility.
- CI workflow's JS/TS fixture-job commands run by hand here with the same
  result the workflow would produce.
- `npm run verify` green, zero regressions (this phase touches no `src/`
  runtime code).

## Status log
- 2026-08-10 — task created, approved, work started.
- 2026-08-10 — API freeze audit: no breaking changes, one docs-only gap
  found (RBACClient has no close() — correctly so, documented in README
  rather than "fixed"). README.md, CHANGELOG.md, publishConfig.provenance
  added. Both README quick starts (JS + TS) actually executed against the
  real built dist/, not just read — both passed.
- 2026-08-10 — CI: `.github/workflows/ci.yml` (verify + JS-consumer-mode +
  TS-consumer-mode fixture jobs) and `publish.yml` (Trusted Publishing/
  OIDC, triggers on GitHub Release only, never auto-runs) added.
  `fixtures/js-consumer/` and `fixtures/ts-consumer/` committed as real
  files (not inlined YAML scripts) and both verified locally end-to-end —
  packed a real tarball via `npm pack`, installed it fresh, ran the
  fixture, confirmed correct behavior — using the exact commands the CI
  workflow runs, before considering the workflow done.
- 2026-08-10 — QA: §10 test-coverage audit confirmed no gaps (role
  resolution/inheritance, path sanitization, circular-inheritance,
  rotation, multi-tenant isolation incl. adversarial tenantId, browser
  bundle smoke — all already covered from earlier phases). Final
  `npm run verify`: typecheck clean, 156/156 tests (unchanged — this
  phase touched no src/ runtime code), build green (10 entry points),
  both smoke tests green.
- 2026-08-10 — tech-lead final review: **APPROVED — merged.** status: done.
