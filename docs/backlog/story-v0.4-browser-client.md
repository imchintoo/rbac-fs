# Story: v0.4 — Browser Build + RBACClient Snapshot API

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-4
plan-ref: "docs/PLAN.md §9 (v0.4 row), §7 (RBACClient), §10 (browser build smoke test)"

## Problem statement
Everything shipped so far (`rbac-fs`'s `.` entry) is Node-only — it wires
`LocalJsonAdapter`, which imports `fs`/`path`/`rotating-file-stream`. §1's
goal "works in Node.js (backend, full read/write) and in browsers
(frontend, read-only snapshot)" isn't real yet for the frontend half.

## Requirements (acceptance criteria)
1. `rbac-fs/client` subpath exports `RBACClient`, matching §7's example
   exactly: `new RBACClient(snapshot)` then `client.can(resource, action)`
   — **synchronous**, no filesystem, no network, in-memory only.
2. The `rbac-fs/client` subpath (and everything it imports) must contain
   zero references to `fs`/`path`/`rotating-file-stream` when bundled for a
   browser target — verified by an actual bundler run, not just a source
   grep (§10 explicitly wants a bundle-level smoke test).
3. `RBACClient` supports conditional grants (`when` clauses), reusing the
   same evaluator the Node-side `RBAC.can()` uses — not a second
   implementation of the same logic.
4. Package.json `exports` map gets a `./client` entry with `types`/
   `import`/`require` per subpath, matching the pattern every other subpath
   in the tree already uses (§2.1).

## Scoping decision — needs explicit resolution before design
`docs/PLAN.md` §7's prose shows the **main `.` export** getting
`node`/`browser`/`default` conditions, but the *code example directly above
it* imports `RBACClient` from **`rbac-fs/client`**, not from `.`. These two
parts of the same section point in slightly different directions.
product-owner is resolving this now rather than leaving solutions-architect
to silently pick one: **`rbac-fs/client` is the browser surface; the `.`
entry stays Node-only, unchanged.** Rationale: the code sample is the more
concrete, authoritative source of truth over the illustrative JSON
snippet, a dedicated subpath is unambiguous for bundlers/consumers (no
"which condition did my bundler pick" debugging), and nothing in the
roadmap needs `.` itself to run in a browser once `/client` exists as the
dedicated surface. Documented here so it's a recorded decision, not a
silent implementation detail.

## Explicitly out of scope
- Any framework adapter (`rbac-fs/react` etc.) — that's v0.7+.
- Any change to how the snapshot itself gets produced/fetched — that's the
  consuming app's job; the package only consumes a snapshot object.
- File watcher / live-reload (v0.5).

## Success metrics
- QA shows: `RBACClient` behavior (unconditional + conditional grants,
  deny-by-default) matches `RBAC.can()`'s semantics for the same
  permission data, and a real `esbuild`-bundled `rbac-fs/client` output
  contains no `fs`/`path`/`rotating-file-stream` references (grep the
  actual bundle, not the source).

## Approval status
**APPROVED — proceeding to engineering-manager.**
