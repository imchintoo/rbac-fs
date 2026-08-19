---
title: What a Quarterly Access Review Actually Costs You
date: 2026-08-19
excerpt: SOC 2 doesn't just want you to review access quarterly — it wants evidence for every quarter, and most teams are paying for that in engineering-manager hours nobody budgeted.
tags: compliance, engineering-management, audit-logging
---

Nobody puts "run the Q2 access review" on a roadmap. It's not a feature, it doesn't ship, and it doesn't show up in a sprint retro. It shows up three weeks before an audit, as a Slack message from whoever owns compliance asking an engineering manager to "just confirm everyone's access still looks right." That message is cheap to send. Answering it properly, every quarter, for as long as the company holds a SOC 2 report, is not — and almost nobody prices it as a recurring cost until it's already eaten a week.

## What SOC 2 actually requires you to produce, every quarter

The requirement itself is narrower than most engineering teams assume. SOC 2's Common Criteria (CC6.1–CC6.3) don't ask you to have perfect permissions — they ask you to periodically review who has access to what, and prove it happened. General user access should be reviewed at least quarterly, with privileged access reviewed monthly or continuously, according to [Torii's 2026 SOC 2 access-review guide](https://www.toriihq.com/articles/soc2-access-reviews). The part that trips teams up isn't the review itself, it's the evidence standard attached to it: if your control description says "quarterly," a twelve-month audit window needs four reasonably spaced review cycles with dated, documented completion records — not three, not "we did one big one in December that covered the year." Missing a single quarter's evidence is a control gap, full stop, regardless of whether access was actually fine.

That evidence has to answer a specific question, not a vague one: for each reviewer, here is the list of people and their current access, attest that it's still correct, and produce a timestamped record that you did. [AccessOwl's 2026 access-review guide](https://www.accessowl.com/blog/detailed-guide-to-soc-2-access-reviews) and [Torii's access-certification overview](https://www.toriihq.com/articles/access-certification) both describe the same three-part shape auditors look for: a policy that states the cadence, a control description that maps to it, and evidence artifacts — screenshots, exports, signed attestations — proving it ran on schedule. Say "quarterly" in your policy and you've committed to producing that four times a year, indefinitely, whether or not anything changed.

## What that costs when it's spreadsheets and Slack

Most teams under, say, 50 engineers run this manually: someone exports a list of who-has-what-access from wherever it lives, drops it in a spreadsheet, pings each manager to review their own reports' access, chases the ones who don't respond, and files the resulting screenshots somewhere the auditor can find them later. None of the public cost data is specific to access reviews — nobody's published "hours per access-review cycle" as a benchmark — but the adjacent data on manual, spreadsheet-driven approval workflows is a reasonable proxy, and it's not small. [InfoSeeMedia's analysis of manual request costs](https://infoseemedia.com/business/saas/the-hidden-costs-of-email-and-spreadsheet-based-employee-requests/) estimates a single manual request — data entry, follow-ups, email-based routing — can easily consume around an hour once every step is counted, with more complex multi-step processes running into tens of dollars per instance in loaded labor cost alone. An access review isn't one request; it's dozens of small ones bundled into a single quarterly push, each with the same follow-up-and-chase pattern.

The actual cost isn't the export — pulling a list of who has what access is usually a five-minute query. It's everything downstream: reviewers who don't respond to the first ping, access that turns out to be wrong and needs a follow-up ticket to fix, and the fact that "who reviewed what, and when" has to be reconstructed and filed as a legible artifact, not just done. That reconstruction step is where a spreadsheet-and-Slack process quietly becomes an engineering manager's Tuesday, every quarter, forever — and it's a cost that scales with headcount and role count, not with anything the product roadmap controls.

## The certification-platform answer, and why most teams don't need it yet

The market has an answer to this, and it's a real category: standalone access-certification platforms (ConductorOne, YouAttest) and full identity-governance suites (SailPoint, Netwrix Identity Manager, Saviynt) that run review campaigns, route entitlements to reviewers automatically, and capture timestamped attestation evidence, per [Torii's 2026 access-certification overview](https://www.toriihq.com/articles/access-certification). These genuinely solve the problem — for teams with enough scale and enough disparate systems (SSO, a dozen SaaS apps, on-prem directories) that a dedicated governance layer earns its keep. They're also new infrastructure: another system to integrate, another vendor contract, another thing someone owns. For a team whose access model is a handful of internal roles gating an internal product, standing up an IGA suite to solve a quarterly Slack-message problem is a real mismatch of tool to task.

## What a diffable, file-based role store actually removes from that cost

This is the part of the access-review cost that `rbac-fs`'s structure happens to remove, not because it was designed as a compliance tool, but because the same properties that make roles easy to hand-edit make them easy to certify. Roles live as plain JSON files under `.rbac/`, so "who currently has access to what" isn't a query against opaque database rows — it's the literal current state of files in your repo, readable and diffable with `git log` and `git diff` without building an export step at all. Every `can()` call is already logged to `logs/<role>.jsonl`, one line per decision, so "did anyone actually use access nobody remembers granting" is a `grep` against a file that already exists, not a new instrumentation project. And because a permission change is a commit — with an author, a timestamp, and a diff — "who approved this specific grant, and when" has an answer that predates the audit request instead of getting reconstructed for it.

None of that automates the actual review — a human still has to look at the list and attest it's correct, on schedule, every quarter. What it removes is the expensive part: building the list, proving when it changed, and reconstructing a paper trail after the fact. The reviewer's job shrinks from "assemble the evidence, then review it" to just "review it," because the evidence — diffable files, an append-only log — was a byproduct of how the system already stores roles, not a separate process someone has to run.

## What this doesn't solve

This isn't a substitute for an actual identity-governance platform once you're past a few dozen roles across multiple systems, and it doesn't route reviews, send reminders, or track who hasn't responded — that coordination work still needs a person or a lightweight process on top. It also doesn't decide your cadence or write your control description; SOC 2 compliance is an organizational commitment, and a library only gives you the record to point to when someone checks that commitment was kept.

## Bottom line

The quarterly access review isn't expensive because the concept is hard — it's expensive because most teams rebuild the evidence trail from scratch every three months. A role store that's already diffable and already logs every decision turns that rebuild into a lookup, which is most of the actual cost difference between "compliance line item" and "five-minute query."

```bash
npm install rbac-fs
```

More at the [docs site](https://imchintoo.github.io/rbac-fs/), on [npm](https://www.npmjs.com/package/rbac-fs), and on [GitHub](https://github.com/imchintoo/rbac-fs).
