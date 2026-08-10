# Story: v0.3 — JSONL Audit Logging + Rotation

status: done
owner: product-owner
created: 2026-08-10
sprint: sprint-3
plan-ref: "docs/PLAN.md §9 (v0.3 row), §5.2 (log entry shape), §6 (rotation), §7 (getAuditLog)"

## Problem statement
v0.1/v0.2 have a `StorageAdapter.appendLog` interface method that's a
documented no-op. §1's goal "role-wise activity/audit logs, with automatic
rotation so files never grow unbounded" isn't real yet. Every `can()` check
should be recorded so a consuming app can answer "who did what, when."

## Requirements (acceptance criteria)
1. Every `rbac.can()` call writes one JSONL line to
   `logs/<role>.jsonl` (§5.2 shape: `ts, user, role, action, resource,
   result, tenantId`) — both allow AND deny outcomes get logged (an audit
   trail that only records approvals isn't an audit trail).
2. Rotation per §6: size-based rotation (default `5MB`), gzip-compressed
   rotated files, a cap on how many rotated files are kept (default 12),
   and a retention window (default `90d`) after which old rotated files
   are deleted. All four defaults overridable via `RBAC`/adapter
   constructor options — `docs/PLAN.md` §6 explicitly requires this because
   `maxAge` may need to respect a consumer's compliance minimum.
3. `rbac.getAuditLog(roleName, { since? })` returns entries at/after
   `since` (ISO date/time string), reading across the active file AND any
   rotated files still within retention — an audit query that silently
   misses rotated history isn't trustworthy.
4. A corrupted/malformed line in a log file must not fail the whole read —
   skip it (§5.2's stated rationale for choosing JSONL over a single JSON
   array/YAML doc in the first place).
5. Logging failures (e.g. disk full, permission error) must not break
   `can()`'s return value — the permission check is the security-critical
   path; audit logging is best-effort alongside it, not a blocking
   dependency of it. Document this trade-off, don't silently hide it.

## Explicitly out of scope
- Log **writes** from `createRole`/`grant`/`revoke`/`deleteRole` (v0.2
  mutations) — §5.2's example entry is a permission-check record
  (`invoice:approve`), not a role-management record. Auditing role
  mutations themselves is a plausible future story but isn't in this one;
  don't scope-creep it in silently.
- Any query filter beyond `since` (no `until`, no `user`/`result` filters)
  — `docs/PLAN.md` §7 shows only `{ since }` in the example call.

## Success metrics
- QA shows: rotation actually happens at the configured size, rotated
  files are gzip-compressed, `maxBackups` is respected (oldest pruned),
  `getAuditLog` returns correct results spanning active + rotated files,
  a hand-corrupted line doesn't crash a read, and a forced `appendLog`
  failure doesn't change `can()`'s return value.

## Approval status
**APPROVED — proceeding to engineering-manager.**
