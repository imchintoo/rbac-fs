---
title: What a due-diligence checklist finds in your authorization layer
date: 2026-08-12
excerpt: SOC 2 auditors and acquisition due-diligence teams both eventually ask who can do what and prove it — here's what they check, and how rbac-fs answers most of it without extra tooling.
tags: compliance, security, due-diligence
---

At some point, someone outside your engineering team is going to ask a question about your authorization layer that isn't "does it work." It'll be a SOC 2 auditor working through CC6.1–CC6.3, or a diligence team assembling a checklist ahead of a fundraise or acquisition. Either way, the question isn't "can users do the right things" — it's "can you prove, on a specific past date, who could do what, and show that someone actually reviewed it." Most engineering teams have never had to answer that question, because most authorization systems weren't built with it in mind.

This isn't a hypothetical concern to plan for later. It's already a documented, recurring finding.

## The two things that actually get checked

**Access reviews, and whether they're evidenced.** SOC 2's Common Criteria (CC6.1 through CC6.3) require periodic review of who has access to what, and — this is the part teams miss — proof that the review happened and what changed as a result. According to [Torii's SOC 2 access-review guide](https://www.toriihq.com/articles/soc2-access-reviews) and [AccessOwl's 2026 access-review guide](https://www.accessowl.com/blog/detailed-guide-to-soc-2-access-reviews), the single most common CC6.3 exception auditors write up isn't "you have bad permissions" — it's "you performed a review once and never repeated it," or "you performed a review but can't produce a record detailed enough to show actual permissions were evaluated." A verbal assurance that "yeah, we checked" doesn't survive an audit. A dated, diffable record does.

**Third-party code in the critical path.** Diligence teams and security-conscious buyers increasingly treat your dependency tree as part of your attack surface, not just your feature set. [DeepStrike's 2026 supply-chain statistics](https://deepstrike.io/blog/supply-chain-statistics) put numbers on why: 66% of the most critical long-lived vulnerabilities in production systems trace back to third-party code, modern JavaScript projects routinely carry 500+ transitive packages, and the volume of malicious packages entering open-source registries rose 73% year over year. Separately, 82% of organizations report carrying unresolved security debt, and the average supply-chain breach goes undetected for 267 days. None of these stats are about authorization libraries specifically — but your authorization layer is exactly the kind of component this scrutiny lands hardest on, because it's the thing deciding who can touch what, and it's frequently built on a policy engine, an embedded query language, or an ORM with a deep dependency tree of its own.

Put those two findings together and you get a fairly specific ask: show me the dependency surface of the code that makes access decisions, and show me a reviewable record of who had access to what and when it changed. Most teams discover they can answer neither cleanly, because the two are usually solved with different tools — a database and admin panel for one, a spreadsheet or a Jira ticket for the other — bolted onto whatever authorization library they picked for developer convenience, not auditability.

## Why this maps directly onto how rbac-fs is built

Two structural decisions in `rbac-fs`, made for engineering reasons, happen to answer both asks without adding anything.

**Zero runtime dependencies in the permission-evaluation path.** The Core Engine's `can()` resolution — role loading, inheritance walking, condition evaluation — has zero third-party runtime dependencies. There's no policy DSL parser, no embedded query language, no ORM in that path. When a diligence checklist or a security review asks "what's in the dependency tree of the code that decides access," the honest answer for the part that actually makes the decision is: nothing external. That's a materially shorter conversation than walking through a transitive dependency graph and explaining why each package is there and what it can't do.

**Every allow and deny is already logged, and roles are already git-diffable.** `rbac-fs` writes one audit record per access decision to `logs/<role>.jsonl` by default — not as an opt-in add-on you have to remember to wire up. Roles themselves live as plain JSON files under `.rbac/`, which means a permission change isn't a row that silently changed in a database — it's a commit, with a timestamp, an author, and a diff. That combination is close to a direct answer to the CC6.3 exception auditors keep citing: instead of reconstructing "who had access to what, and did we review it" from memory or a spreadsheet, you have two artifacts that already exist — the audit log for decisions made, and git history for permissions granted or revoked — both queryable, both dated, neither requiring a new tool.

This doesn't make you SOC 2 compliant on its own — access reviews, control documentation, and the rest of the Trust Services Criteria are organizational processes, not something a library can complete for you. What it does is remove the two hardest technical gaps: an authorization layer with an opaque dependency footprint, and a permission history that only lives in someone's memory of "I think we changed that in March."

## What this doesn't solve

Multi-tenant isolation in `rbac-fs` is folder-based (`.rbac/tenants/<id>/...`), with a separate, non-inheritable `_shared/` namespace for platform-level roles — structurally sound, but still something a diligence team will want explained, not assumed. It's also worth being direct about scope: `rbac-fs` is one component of an access-control story, not a compliance program. You still need someone assigned to actually run the review, decide the cadence, and document the decision — the library gives you the record to point at when they do, not a substitute for doing it.

## Bottom line

The audit trail and the dependency footprint of your authorization layer are two things nobody asks about — until a SOC 2 auditor, an acquirer's security review, or an investor's technical diligence checklist does, at which point they're often the hardest things to produce on short notice. Building both in from the start, instead of retrofitting them under deadline, is cheaper every time.

```bash
npm install rbac-fs
```

More at the [docs site](https://imchintoo.github.io/rbac-fs/), on [npm](https://www.npmjs.com/package/rbac-fs), and on [GitHub](https://github.com/imchintoo/rbac-fs).
