---
title: "Tutorial: querying and rotating rbac-fs audit logs"
date: 2026-07-28
excerpt: A hands-on walkthrough of configuring log rotation and querying audit history in rbac-fs, including what each rotation option actually controls.
tags: audit-logging, tutorial
---

Audit logging is on by default in `rbac-fs`. This walks through actually configuring it — rotation, retention, and querying — instead of just accepting the defaults.

## Configure rotation at construction time

```ts
const rbac = new RBAC({
  tenantId: 'acme-corp',
  rotation: {
    maxSize: '5MB',   // rotate the active log once it reaches this size
    maxAge: '90d',    // delete rotated files older than this
    compress: 'gzip',  // compress rotated files
    maxBackups: 12,    // keep at most this many rotated files per role
  },
});
```

Each option controls a different failure mode:
- **`maxSize`** stops a single log file from growing unbounded for a high-traffic role — once it hits 5MB, the active file rotates and a fresh one starts.
- **`maxBackups`** caps total disk usage per role — old rotated files beyond this count get pruned.
- **`maxAge`** is a retention policy, independent of size — a rotated file gets deleted once it's older than this, even if you're nowhere near `maxBackups`.
- **`compress: 'gzip'`** shrinks rotated files on disk — the active (currently being written) log is never compressed, only files that have already rotated out.

## What ends up on disk

```text
.rbac/tenants/acme-corp/logs/
├── manager.jsonl           ← active, currently being written
├── manager.jsonl.1.gz      ← most recent rotation, compressed
└── manager.jsonl.2.gz      ← older rotation
```

## Querying

```ts
const recentEntries = await rbac.getAuditLog('manager', { since: '2026-08-01' });
console.log(recentEntries.length, 'decisions since Aug 1');

const denials = recentEntries.filter((e) => e.result === 'deny');
console.log(denials.length, 'denied checks in that window');
```

`getAuditLog()` reads the active log file; querying across rotated/compressed history is a case you'd handle at the application layer (decompress + parse the `.gz` files directly) if you need it — the built-in query is scoped to recent, actively-relevant history by design, matching the common "what happened recently" audit question rather than full historical analytics.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html#audit-logging-rotation">Full rotation config reference in Core Concepts →</a></div>

## One thing to configure deliberately, not accept blindly

The default `maxAge` is conservative but arbitrary relative to *your* compliance requirements — if your industry or contract requires a specific minimum audit retention period, set `maxAge` to match it explicitly rather than trusting the default. `rbac-fs` won't silently delete audit history you're required to keep, but it also won't know your requirement unless you tell it.

Verified against [`examples/05-audit-logging.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/05-audit-logging.mjs).
