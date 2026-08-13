---
title: Permission drift is a solved problem in IaC. Not in RBAC.
date: 2026-08-13
excerpt: Infrastructure teams spent years naming and tooling against "drift" — the gap between declared and enforced state. Most RBAC systems have the exact same failure mode and no name for it.
tags: architecture, rbac, live-reload
---

If you run infrastructure, you already have a word for this: drift. Someone opens the cloud console during an incident, tweaks a security group, ships the fix, and forgets to update the Terraform that's supposed to describe reality. Six months later `terraform plan` wants to revert a change nobody remembers approving, or worse, nobody notices and the gap just sits there. Policy-as-code and drift-detection tooling exist specifically because this keeps happening — 2026 roundups of IaC governance tools treat continuous drift detection as table stakes, not a nice-to-have, and dedicated glossary entries now define "policy drift" as its own named category alongside network and encryption drift.

Permissions have the identical failure mode. It just doesn't have a name in most RBAC discussions, because the RBAC world hasn't borrowed the vocabulary yet.

## The gap nobody names

Here's the shape of it in an access-control system: a role's permissions live in a database row, mutated through an admin panel. Granting a permission and *recording* that grant are two separate operations. An engineer clicks "add permission" in the UI; that write succeeds or fails independently of whatever change-log, ticket, or Slack message was supposed to accompany it. If the write succeeds and the paper trail doesn't, you now have a system whose actual, enforced behavior no longer matches whatever your team believes is true about who can do what. Nobody decided that outcome. It's structural — the same way infrastructure drift is structural, because a console click and a Terraform apply are two independently-failable paths to the same resource.

The security-drift literature already puts "unauthorized modifications to access permissions" in the same category as network-policy drift and encryption-config drift. It's treated as a solved-in-principle problem for infrastructure: watch the actual state, diff it against the declared state, alert on divergence. Nobody's shipping that same tooling for role-based access control in application code, because most RBAC systems don't have a "declared state" to diff against in the first place. The database row *is* the state. There's nothing to compare it to.

## Why a file changes the shape of the problem

`rbac-fs` stores every role as a JSON file under `.rbac/`:

```json
{
  "name": "manager",
  "permissions": [
    { "resource": "invoice", "actions": ["view", "approve"] }
  ]
}
```

That file is both the declaration and the enforcement mechanism at once. There's no admin-panel write path that mutates a database row independently of what's checked into version control, because there's no database row — the file the engine reads at runtime and the file your team reviews in a pull request are the same artifact. You can't drift the "declared" version away from the "enforced" version because they were never two things.

The second half of the argument is live-reload, and it matters more than it looks like it should. `rbac-fs` caches parsed role files in memory for performance, but watches the roles directory with `chokidar`. A hand edit — or a `grant()`/`revoke()` call, which also just writes the file — invalidates that role's cache entry, and the next `can()` check reads the new version from disk. No restart, no deploy, no separate "apply" step:

```ts
await rbac.can(user, 'invoice', 'delete'); // false

// someone edits manager.json directly, or calls rbac.grant(...)

await rbac.can(user, 'invoice', 'delete'); // true — picked up automatically
```

That closes the exact gap infrastructure drift lives in. Terraform drift happens because the desired-state file and the actual running resource are reconciled by a pipeline that can be skipped, partially run, or simply not triggered. With file-based roles and a watcher, there is no reconciliation pipeline to skip — the read path *is* the reconciliation. If you can disable the cache entirely (`{ cache: false }`) for filesystems where watching isn't reliable, you're trading a performance optimization for a stronger guarantee, not choosing between "fast and possibly stale" and "slow and possibly stale."

## What this doesn't claim

This isn't an argument that file-based permissions are strictly better than a database-backed authorization service in every dimension — high-throughput, distributed-consistency use cases (the kind Zanzibar-style systems like SpiceDB or OpenFGA are built for) have real requirements a JSON file on disk doesn't meet, and that's a genuinely different problem than the one described here. It's also not the same claim as "git-diffable roles are easier to review," which is a process argument about who looks at a change before it ships. This is a structural argument about whether a divergence between declared and enforced state can exist at all, independent of whether anyone reviewed it. Those are two different properties, and file-based RBAC happens to give you both, for related but distinct reasons.

## What this means for a team that's felt this before

If your team has ever done a permissions audit and found a role with an entitlement nobody could explain, you've already experienced permission drift — you just didn't have the word for it, and you probably didn't have a systematic way to prevent the next one. The infrastructure world's answer wasn't "review changes more carefully." It was "remove the possibility of the declared and enforced states silently diverging in the first place," by making the file the only path to the running state. Applying the same structural fix to permissions doesn't require new tooling or a new discipline — the mechanism is just what a file-based role system with a watcher already does by default, for reasons that were originally about developer convenience (hand-editable roles, no restart needed) rather than drift prevention specifically. The drift resistance is a side effect of the storage model, not a feature bolted on top of it.

## Bottom line

Infrastructure teams spent real effort naming "drift" as a distinct failure mode and building tooling to detect it after the fact. RBAC systems built on a database and an admin panel have the same failure mode without the tooling, because there's no declared-state artifact to diff against. A file-based role store with a watcher doesn't detect drift faster — it removes the two-independently-failable-paths structure that makes drift possible in the first place.

```bash
npm install rbac-fs
```

Docs, source, and the rest of this blog: [docs site](https://imchintoo.github.io/rbac-fs/), [npm](https://www.npmjs.com/package/rbac-fs), [GitHub](https://github.com/imchintoo/rbac-fs).
