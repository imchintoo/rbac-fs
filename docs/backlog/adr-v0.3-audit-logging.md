# ADR: v0.3 — JSONL Audit Logging + Rotation

status: approved
owner: solutions-architect
created: 2026-08-10
plan-ref: "docs/PLAN.md §5.2, §6, §7; docs/backlog/story-v0.3-audit-logging.md"

## Context
§6 says "use `rotating-file-stream` under the hood" with a config shape
(`maxSize`, `maxAge`, `compress`, `maxBackups`) that's PLAN's own
illustrative naming, not the library's actual option names. Verified the
real API (`rotating-file-stream@3.2.9`, installed, README read directly —
not assumed) before designing this ADR, per the lesson already logged
about verifying claims rather than eyeballing them.

## Decision

### Real API mapping
| PLAN §6 name | `rotating-file-stream` option | Notes |
|---|---|---|
| `maxSize` | `size` | Triggers rotation. Format differs: PLAN writes `'5MB'`, library wants `'5M'` — `local-json-adapter.ts` normalizes `KB/MB/GB` → `K/M/G` so either spelling works from our public config. |
| `maxBackups` | `maxFiles` | Count of rotated files kept. |
| `compress` | `compress` | Passed through as-is (`'gzip'` or `boolean`). `.gz` extension is auto-appended by the library (v3 default) — our filename generator must NOT add it itself. |
| `maxAge` | **not supported natively** | The library only prunes by count (`maxFiles`) or total size (`maxSize`, a *different* option than PLAN's `maxSize` — confusingly named collision, another reason to verify the real API instead of assuming). Age-based retention is hand-rolled: on the library's `'rotated'` event, sweep the role's `logs/` dir and unlink any rotated file whose mtime exceeds `maxAge`. |

**Consequence of the naming collision:** our own config keeps PLAN's
names (`maxSize`, `maxAge`, `compress`, `maxBackups`) as the public
surface — friendlier and matches the spec — and `local-json-adapter.ts`
translates them to the library's `size`/`maxFiles`/`compress` internally.
This is the one file allowed to know the library exists at all.

### Filename generator
```ts
const generator: Generator = (time, index) => (time === null ? `${roleName}.jsonl` : `${roleName}.jsonl.${index}`);
```
Matches §4's example layout (`admin.jsonl`, `admin.jsonl.1.gz`) exactly —
`time` is only non-null when the library is asking for a *rotated* name, so
`index`-only naming (no date component) is correct since we rotate by size,
not by interval.

### One stream per (tenantId, role), kept open
`LocalJsonAdapter` caches `RotatingFileStream` instances in a
`Map<string, RotatingFileStream>` keyed by `${tenantId ?? '_shared'}::${roleName}`,
created lazily on first `appendLog`. An `'error'` listener is attached at
creation — **required**, not optional: an unhandled `'error'` event on a
Node stream crashes the process, and story requirement #5 (logging
failures must not break `can()`) demands we never let that happen. A new
`adapter.close()` method ends all cached streams — needed for graceful
shutdown and for tests to exit cleanly (open file handles otherwise keep
`node --test` alive).

### `getAuditLog` — new optional `StorageAdapter` method
```ts
loadAuditLog?(tenantId: string | null, roleName: string, options?: { since?: string }): Promise<AuditEntry[]>;
```
Added as **optional** (`?`), following the precedent `watch?` already set
in v0.1 for a capability not every adapter needs to support. `RBAC.getAuditLog()`
throws a clear error if the wired adapter doesn't implement it, rather than
silently returning `[]`. `LocalJsonAdapter.loadAuditLog`:
1. Lists `logs/` for `<role>.jsonl` and `<role>.jsonl.<n>[.gz]`.
2. Reads each (gzip via `node:zlib`, no new dependency).
3. Parses JSONL, **skipping a malformed line rather than failing the whole
   read** — directly the rationale §5.2 gives for choosing JSONL at all;
   skip silently at this layer, don't invent a warning-callback API for it
   in v0.3.
4. Filters `ts >= since` when given, returns all entries sorted
   chronologically (reading order across rotated + active files isn't
   guaranteed chronological once `maxFiles` has pruned things unevenly, so
   an explicit sort is correct, not just defensive).

This is a public interface addition, not a breaking change to a shipped
1.0 — the package is still pre-1.0 (semver allows this between minor
versions before a stable release; noting it so it isn't mistaken for
carelessness).

### Wiring into `can()`
`RBAC.can()` builds the `AuditEntry` after evaluating the result and calls
`adapter.appendLog(...)`, **awaited**, wrapped in `try/catch` that swallows
the error. Awaited (not fire-and-forget) for v0.3 because:
- Determinism: tests need `can()` to have finished logging before they can
  assert against the log file, and the package doesn't have an event/hook
  system yet to signal "log write done" otherwise.
- v0.3 has no stated latency budget in `docs/PLAN.md` — premature
  fire-and-forget optimization isn't justified by a real requirement yet.

Flagging for a future revisit (not filing a story now — no evidence of a
real perf problem): if `can()` latency becomes a concern once there's a
framework adapter in the hot path (v0.6+), reconsider fire-and-forget with
an explicit `rbac.flush()`/event hook for tests instead.

## Consequences
- First real runtime dependency in the whole package:
  `rotating-file-stream` — but only as a dependency of `LocalJsonAdapter`
  (Node-only already), not the isomorphic Core Engine. Does not violate
  §1/§2.1's "zero dependencies in the core engine" — that promise was
  always scoped to `src/core/`, verified by the same grep check used in
  v0.1/v0.2.
- `StorageAdapter.loadAuditLog` is optional — a future `PostgresAdapter`
  (§9, v1.x) could reasonably skip implementing rotation/retention
  entirely (a database doesn't need file rotation) and just support
  `loadAuditLog` directly against a table.

## Verdict
**APPROVED — proceeding to tech-lead.**
