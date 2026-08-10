# Sprint 1 — v0.1 Core Engine

status: shipped
owner: engineering-manager
created: 2026-08-10
plan-ref: "docs/PLAN.md §9 (v0.1)"

## Scope
`story-v0.1-core-engine.md` only. Single role involved (backend-engineer) —
no fan-out: every v0.1 ticket touches shared Core Engine modules or
`LocalJsonAdapter`, so tickets run sequentially on one instance per
CLAUDE.md's fan-out rule ("two tickets that both touch Core Engine or
`LocalJsonAdapter` stay on one instance").

## Risk assessment
- **Low** — no external dependencies beyond `typescript`/build tooling
  (dev-only), no network calls, no breaking-change surface yet (nothing
  published).
- **Watch item:** condition evaluator (`when: "owner_id == user.id"`) must
  not become a general `eval()` — scope it to equality-only comparisons per
  the story's acceptance criteria, flag to tech-lead if backend-engineer's
  implementation drifts wider.

## Definition of done
QA runs and shows output for: role inheritance resolution, path
sanitization/traversal rejection, circular-inheritance rejection. Build
produces working CJS + ESM + `.d.ts` from a single TS source tree.
