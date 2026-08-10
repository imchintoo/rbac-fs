# Backlog

Single source of truth for all epics, stories, and tasks.

## Structure

```
docs/backlog/
  README.md          — this file
  lessons.md          — running log of corrections (see CLAUDE.md → Self-Improvement Loop)
  epic-<slug>.md      — high-level business goal (product-owner writes/approves)
  story-<slug>.md     — user story derived from an epic (product-owner writes, engineering-manager approves sprint placement)
  task-<slug>.md      — implementation ticket (tech-lead creates from approved story)
  adr-<slug>.md       — architecture decision record (solutions-architect writes)
  sprint-<n>-scope.md — sprint-level scope snapshot
```

## Status values

Applies to `epic-*`, `story-*`, and `task-*` files:

| Status        | Meaning                                      |
|---------------|-----------------------------------------------|
| `draft`       | Not yet reviewed — not actionable            |
| `approved`    | Signed off by the appropriate role gate      |
| `in-progress` | Actively being worked                        |
| `done`        | Implemented + QA sign-off received           |
| `blocked`     | Waiting on external input                    |

**A story/task with `status: draft` is not actionable. Engineers must not
start work without `status: approved`.**

Sprint-scope (`sprint-*-scope.md`) and rollup (`rollup-*.md`) files track
sprint-level lifecycle rather than individual story/task state, and use their
own values outside the table above (`approved` → `shipped`/`closed` once the
sprint's Definition of Done is met and tech-lead's final review is signed
off).

## File header template

```markdown
# Epic|Story|Task: <title>

status: draft
owner: <role>
created: YYYY-MM-DD
plan-ref: "docs/PLAN.md §<section> — <short label>"
```

`plan-ref` is required on every backlog file — it's how work stays traceable
back to `docs/PLAN.md` instead of re-deriving the spec inline. See
`CLAUDE.md` → "Backlog (single source of truth)".
