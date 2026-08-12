---
title: Every allow and deny, logged
date: 2026-07-30
excerpt: How rbac-fs's built-in audit trail works — JSONL format, why not a single JSON array, and what's actually in each record.
tags: audit-logging, security
---

"Who approved this invoice, and when" is a question every access-control system gets asked eventually — usually after something's already gone wrong. `rbac-fs` answers it by default, not as an opt-in feature you have to remember to wire up.

## Every can() call writes a line

```ts
await rbac.can(user, 'invoice', 'approve');
```

This one call does two things: evaluates the permission, and appends one line to `.rbac/tenants/acme-corp/logs/manager.jsonl`:

```json
{"ts":"2026-08-10T10:15:00Z","user":"chintan","role":"manager","action":"invoice:approve","resource":"inv-4521","result":"allow","tenantId":"acme-corp"}
```

Both allows and denies get logged — a log of only the denials would miss the more common audit question, which is usually "who *was* allowed to do this," not just who was blocked.

## Why JSONL, not a JSON array or YAML

A single JSON array (`[{...}, {...}]`) or one big YAML document has a real failure mode: a crash or power loss mid-write can corrupt the whole file, making every previous entry unreadable along with the incomplete one. JSONL — one complete JSON object per line — means a corrupted final line only breaks that one record; every line before it still parses fine. For an audit log specifically, "lose the last write" is a much better failure mode than "lose the whole file."

## Reading it back

```ts
const entries = await rbac.getAuditLog('manager', { since: '2026-08-01' });
```

`since` filters by timestamp — useful for "what happened this week" style queries without loading the entire history into memory for roles that have been active a long time.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html#audit-logging-rotation">Audit logging + rotation in Core Concepts →</a></div>

## What it doesn't do

It's an append-only record of decisions, not a general-purpose event log — it won't capture role *creation*/`grant`/`revoke` events themselves (those are a separate audit surface worth building at the application layer if you need it, since *who's allowed to change roles* is itself a permission check per [Security Guardrails](/docs/security.html)). And it's per-role, per-tenant — there's no single global log file to tail for "everything that happened everywhere," by design, since that file would grow unbounded across every tenant and role in the system simultaneously.

See [Querying and rotating rbac-fs audit logs](/blog/tutorial-querying-and-rotating-audit-logs.html) for the hands-on version, including what happens once a log file gets large.
