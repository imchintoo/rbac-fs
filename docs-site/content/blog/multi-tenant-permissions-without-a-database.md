---
title: Multi-tenant permissions without a database
date: 2026-08-08
excerpt: Folder isolation instead of a WHERE clause — what that structurally buys you for tenant isolation, and where it stops being enough at real scale.
tags: multi-tenant, architecture
---

Almost every multi-tenant authorization system reaches for the same pattern: a `tenant_id` column, and a `WHERE tenant_id = ?` clause on every query that touches roles or permissions. It works. It's also the single easiest security invariant to forget, because it depends on every code path remembering to apply it.

## The failure mode is quiet

A `WHERE tenant_id = ?` clause that gets dropped from one query doesn't throw an error. It returns data. Usually the right data, until the day someone writes a new endpoint, an admin tool, or a background job that queries the roles table directly and forgets the filter. Now tenant A can see — or worse, modify — tenant B's permissions, and nothing in the system flagged it, because the query was syntactically valid the whole time.

This isn't a hypothetical about careless engineers. It's what happens when tenant isolation is a *convention* (remember the WHERE clause) rather than a *structure* (the data literally isn't reachable another way).

## What folder isolation looks like

`rbac-fs` puts each tenant's roles in its own folder:

```text
.rbac/
├── tenants/
│   ├── acme-corp/
│   │   └── roles/manager.json
│   └── globex-inc/
│       └── roles/manager.json
└── _shared/
    └── roles/system-admin.json
```

```ts
const acme = new RBAC({ tenantId: 'acme-corp' });
const globex = new RBAC({ tenantId: 'globex-inc' });

// Same role name, completely separate files:
await acme.can(user, 'invoice', 'approve');   // only ever reads acme-corp/roles/
await globex.can(user, 'ledger', 'approve');  // only ever reads globex-inc/roles/
```

There's no query to forget a filter on, because there's no shared table to query. An `RBAC` instance constructed for `acme-corp` has no code path that can read `globex-inc`'s files — not "shouldn't," structurally can't, short of a bug in path construction itself. And that specific risk — a malicious or malformed `tenantId` string trying to escape its folder (`../../globex-inc`, for example) — is exactly what `rbac-fs` sanitizes against on every call; see [Security Guardrails](/docs/security.html) for the identifier-validation rule.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html#multi-tenancy">See the full multi-tenancy model in Core Concepts →</a></div>

## Where this stops being enough

Folder isolation is a strong default and a bad fit for some scale profiles. If you have tens of thousands of tenants, filesystem directory listing and open-file-handle limits become a real constraint before a well-indexed database table would even notice. If you need cross-tenant reporting — "show me permission grants across all tenants for this audit" — a database that can aggregate across rows is a better fit than scripting a walk across thousands of folders.

`rbac-fs` doesn't pretend files are the right choice at every scale. The `StorageAdapter` interface exists specifically so a database-backed adapter can implement the same isolation guarantee — row-scoped by `tenant_id`, same as the pattern this post opened with — without changing the public API a single line of application code depends on. Structural isolation and runtime scale aren't actually in tension; they're just solved by different `StorageAdapter` implementations behind the same `can()` call. See the [Roadmap](/docs/roadmap.html) for where the database-backed adapter work stands.

## The actual trade-off

Not "files beat databases for multi-tenancy." It's narrower: **isolation that's structural is safer than isolation that's conventional**, and folders happen to be a cheap way to get structural isolation at small-to-medium tenant counts, for free, without asking every future engineer to remember a WHERE clause.
