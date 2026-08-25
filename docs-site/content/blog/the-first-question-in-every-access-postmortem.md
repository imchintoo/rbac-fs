---
title: The first question in every access postmortem
date: 2026-08-25
excerpt: When an access incident hits, the first question is never "how did the bug happen" — it's "who could do this, and who approved it." Here's why most teams can't answer that in under an hour, and what changes when the answer is a grep.
tags: audit-logging, engineering-management, incident-response
---

## The question that comes before the bug report

On March 24, 2026, a code change at Linear caused data from private teams to become visible to other workspace members — including guest users — for about an hour before it was caught and reverted. Linear's [public postmortem](https://linear.app/now/linear-incident-on-mar-24th-2026) describes auditing access and modification logs across every affected workspace to determine exactly who saw what, for how long.

That's the part of an access incident that doesn't make it into most engineering retros. The bug itself — a permission check that resolved wrong for an hour — is usually a small diff and a fast fix. The expensive part is everything after: figuring out who actually had access during the window, whether anyone used it, who granted the access that made the window possible in the first place, and being able to say all of that with evidence instead of "we're pretty sure."

If you manage a team that ships anything with role-based access, you will eventually sit in a room where someone asks "who approved this?" about a permission nobody remembers granting. How long that takes to answer is a property of your system, not your team's diligence.

## Where the evidence usually lives

In a typical stack, answering "who could do this and who approved it" means pulling from several places that don't talk to each other:

The database row for the role or grant, if roles are ORM-backed — usually just the current state, not history, unless someone bolted on a separate audit table. The deploy log, if the permission was code-baked and shipped in a release. Slack DMs or a ticket, if the grant was a manual "can you bump my access" request that got approved out-of-band. IAM or admin-panel change history, if your cloud provider or your own admin UI happens to log role changes — and if retention didn't expire before you needed it. Git history for the *code* that defines roles, if roles are hardcoded — but that only tells you when the role's permissions changed, not when a specific user was granted that role.

None of these sources is wrong to have. The problem is reconciling them under time pressure, during an incident, when the honest answer needs to cite two or three of them and none of them index cleanly by "user + resource + point in time."

## What the same question looks like with file-based roles

rbac-fs stores every role as a plain JSON file under `.rbac/` (or `.rbac/tenants/<id>/` for multi-tenant setups) and logs every `can()` decision — allow and deny — as one JSON line per record in `logs/<role>.jsonl`. That split matters for a postmortem, because it splits the question in two, and each half has its own evidence trail.

**"Who granted this, and when?"** is a question about the role file itself. If `.rbac/` is committed to your repo — which is the normal way to run it, since that's the entire pitch of storing roles as diffable JSON instead of database rows — the answer is `git log -p .rbac/tenants/acme/roles/support-agent.json` or `git blame` on the specific permission line. You get a commit, an author, a timestamp, and a PR link if you require review on that path, the same way you'd get it for any other code change. No separate audit system to stand up; it's the same git history you already have for everything else.

**"Who used it, and when?"** is a question about the JSONL log. Because it's append-only and one record per decision — subject, action, resource, allow or deny, and which role/condition matched — reconstructing a window of activity is a `grep` for a timestamp range and a resource, not a cross-system correlation exercise:

```bash
grep '"resource":"invoices/acme-corp"' logs/support-agent.jsonl \
  | jq 'select(.timestamp > "2026-08-20T00:00:00Z")'
```

Put together, a postmortem timeline looks like: the role file diff shows a permission was widened on a specific date by a specific person (via git blame), and the JSONL log shows exactly which requests that widened permission actually allowed afterward, if any. Both come from files already sitting in the repo and the log directory — nothing to provision, nothing to query through a vendor's retention window, nothing that needs a support ticket to a platform team to pull.

## What this doesn't do

It's worth being precise about the boundary here, because it's easy to oversell an audit trail. rbac-fs's logs tell you what happened after the fact — they don't detect an over-broad grant *before* someone uses it, and they're not an anomaly-detection system watching for unusual access patterns in real time. If your incident spans multiple services with their own auth layers, the JSONL log only covers the decisions rbac-fs itself made; you'll still need to correlate against whatever those other systems produce. And if you're at a scale where you need continuous, cross-system access certification — the kind SOC 2's stricter interpretations and dedicated IGA platforms (SailPoint-class tooling) are built for — file-based logs are an input to that process, not a replacement for it.

What it does solve is the specific, recurring failure mode where the evidence exists but takes half a day to assemble because it's scattered across systems with different retention policies and no shared key to join them on. For a team without a dedicated security engineering function, that's often the actual gap — not a lack of audit capability, but a lack of one place to look first.

## Bottom line

The best time to design for "who approved this" is before you need to answer it in a live incident channel. If your role definitions are files with git history and your permission checks write an append-only log by default, that question gets a lot cheaper to answer — not because the incident is less serious, but because reconstructing the timeline stops being its own investigation.

```bash
npm install rbac-fs
```

Docs at [imchintoo.github.io/rbac-fs](https://imchintoo.github.io/rbac-fs/), package on [npm](https://www.npmjs.com/package/rbac-fs), source on [GitHub](https://github.com/imchintoo/rbac-fs).
