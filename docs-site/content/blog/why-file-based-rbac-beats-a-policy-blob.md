---
title: Why file-based RBAC beats a policy blob
date: 2026-08-12
excerpt: Git-diffable roles aren't a gimmick — they change who can review a permission change, and when, compared to an opaque policy blob in a database.
tags: rbac, architecture, security
---

Most role-based access control systems store roles and permissions the same way they store everything else: a database table, an admin panel, an API call away from being changed by anyone with write access. That's a reasonable default for application data. It's a bad default for the thing that decides who can do what.

## The permission that nobody reviewed

Here's a scenario that's easy to end up in without anyone deciding to: a support engineer needs to unblock a customer at 11pm, opens the admin panel, grants themselves `invoice:delete` on a role they don't normally use, fixes the issue, and forgets to revoke it. Nothing about that flow requires a second pair of eyes. Nothing about it leaves a record that's easy to find later. Six months on, an audit finds a role with a permission nobody remembers granting, and there's no way to answer "why does this exist" except asking around.

That's not a hypothetical failure of any specific product — it's structural. A policy blob in a database is mutable state with no required review step, by design, because that's what makes admin panels convenient.

## What changes when the role is a file

`rbac-fs` stores every role as a JSON file under `.rbac/`:

```json
{
  "name": "manager",
  "permissions": [
    { "resource": "invoice", "actions": ["view", "approve"] }
  ]
}
```

That file lives in the same repository as the code that enforces it, or at minimum in the same version-control discipline your team already applies to everything else. A permission change becomes a diff:

```diff
   { "resource": "invoice", "actions": ["view", "approve"] },
+  { "resource": "invoice", "actions": ["delete"] },
```

A diff has an author, a timestamp, and — if your team requires it, which most already do for code — a reviewer. The same social process that catches a bad database migration or an accidental `DROP TABLE` in a PR now also catches "why is this role getting a delete permission on invoices."

## This isn't a replacement for runtime speed

To be direct about the trade-off: reading a JSON file on every permission check doesn't scale the same way a database index does at high request volume. `rbac-fs` caches role files in memory and invalidates on change (see the [Core Concepts](/docs/core-concepts.html#live-reload) page for how live-reload works), which covers the common case well. For very high-throughput services, the plan is a `StorageAdapter`-based database backend — same public API, same file-as-source-of-truth workflow, different runtime store. Files stay the git-reviewable source of truth either way; see the [Roadmap](/docs/roadmap.html) for where that's headed.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/core-concepts.html">Read the full multi-tenancy and role model in Core Concepts →</a></div>

## The actual claim

Not "files are always better than databases" — they're not, for runtime access patterns at scale. The claim is narrower and, I think, harder to argue with: **the thing that decides who can do what in your system should go through the same review process as the code that enforces it.** A database table doesn't give you that for free. A file in your repo does, because it's already inside a process your team follows for other reasons.
