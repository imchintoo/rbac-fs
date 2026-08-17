---
title: The Authorization Cost Nobody Is Pricing In
date: 2026-08-16
excerpt: The build-vs-buy literature treats authorization as a choice between building a service and buying one, but the cost data both sides cite actually argues for a third option neither names.
tags: build-vs-buy, engineering-costs, founders
---

If you've ever sat through a technical diligence call, you've heard some version of this question: "walk me through how you handle permissions." It usually comes from an investor's technical advisor, an acquirer's engineering lead, or a new CTO doing a 90-day audit. And the answer most founders give — "we built it ourselves" or "we're on [managed platform]" — is treated as a settled fact rather than a cost decision that's still being paid down every month.

That's because the entire public conversation about authorization frames it as a binary: build a system in-house, or buy one from a vendor. Every framework, rubric, and TCO model built around that question inherits the binary's assumptions. And once you actually read the cost data those frameworks cite, it becomes obvious both options are more expensive than they look — and that there's a third option the literature doesn't mention at all.

## The two options everyone talks about

Cerbos, one of the more widely cited authorization vendors, publishes a build-vs-buy rubric aimed at exactly this decision. Their honest framing of "build" is worth reading closely: it requires "at least two experts so that if one leaves the second maintains the expertise," and rolling your own authorization "can take months," compared to days-to-weeks for integrating a vendor. Their case study, a company called Human Managed, describes what happens without that investment — every permission change meant going into source code, recompiling, redeploying, and testing, a cycle that ate real engineering time on every change. After moving to a managed platform, that became "a five-minute job."

That's the honest cost of "build": a minimum of two dedicated people, months of runway, and a maintenance tax on every future permission change for as long as the system lives. It's not a controversial claim — it's the same shape of decision every internal-tooling category eventually confronts. The internal-developer-platform world has the same argument with harder numbers attached: one 2026 analysis of IDP build-vs-buy decisions cites an estimate that a 100-engineer team running a self-built or open-source internal platform costs $500,000–$1,000,000 a year in engineering resources, with 3–5 people dedicated to it full time. The same analysis is blunt about the failure mode: "a poorly executed custom build can consume 10–15% of your engineering budget annually without delivering proportional value." That's a different category of software than authorization, but it's the identical pattern — a "build" decision quietly becomes a standing headcount line, not a one-time project.

"Buy" solves the headcount problem but trades it for a different one: a recurring bill that scales with usage, a policy engine that lives outside your repository, and a dependency on a vendor's roadmap, pricing changes, and uptime. Every build-vs-buy framework acknowledges this trade-off exists — flexibility and control on one side, speed and reduced maintenance on the other — and then asks you to pick a point on that spectrum.

## The option the spectrum doesn't include

Here's what's missing from every version of this framework: the assumption that authorization has to be either a system you build or a service you buy. Both options imagine authorization as infrastructure — something with its own deployment, its own on-call rotation, its own budget line. That's a reasonable assumption if you're Airbnb building Himeji for a microservices migration, or a bank standing up a Zanzibar-style relationship-graph system with real distributed-consistency requirements. It's a much less reasonable default for the majority of teams whose actual requirement is "roles, permissions, and an audit trail that a diligence team can read."

For that requirement, there's a third path that the "build vs. buy" literature never names: install a library. Not a service. Not a platform with its own control plane. A package that lives in `node_modules`, does its job in-process, and leaves no infrastructure behind to run or staff.

That's the specific gap `rbac-fs` sits in. Roles and permissions are stored as plain JSON files under `.rbac/` in your own repository — not rows in a database you have to run, and not policy configuration living in a vendor's control plane you have to trust. There's no server to deploy, no per-seat or per-request bill, and no dedicated headcount required to keep it alive, because there's no service-shaped thing to keep alive. You `npm install`, define roles as files, and call `can()`. The Core Engine's permission-evaluation path — the actual `can()` resolution, role inheritance, and condition evaluation — has zero third-party runtime dependencies, so there's no transitive dependency tree to audit in the one code path a diligence review will scrutinize hardest. It works the same way in Node and the browser, and ships with eight framework adapters (NestJS, Express, Fastify, Koa, React, Vue, Angular, Svelte) so teams don't have to hand-roll the integration layer either. It's MIT licensed, so there's no pricing curve to model in the first place.

That doesn't erase engineering time entirely — someone still designs the role hierarchy, writes the condition logic, and decides on multi-tenant structure (`rbac-fs` isolates tenants by folder, with `_shared/` as a separate, non-inheritable namespace for platform-level roles). But it collapses the two costs both build-vs-buy camps treat as unavoidable: the multi-person maintenance commitment "build" requires, and the recurring, scaling bill "buy" requires. What's left is closer to the cost of adopting any well-scoped open-source library — which is exactly why it doesn't show up in a framework built to compare services against services.

## What this doesn't solve

Being direct about scope matters more here than anywhere else, because the pitch is "cheaper," and cheap-but-wrong is worse than expensive-but-right. `rbac-fs` is role-based access control with a composable condition tree (`and`/`or`/`not` over a fixed operator set — no `eval()`, no `Function()`, ever) — it's not a relationship-graph system like Zanzibar-style tools, and it doesn't attempt distributed consistency across services the way a dedicated policy service does. It has built-in audit logging (`logs/<role>.jsonl`, one line per decision, with rotation controls) and role inheritance with cycle detection, live-reload for hand-edited files, and schema validation with reserved-role protection on writes — but none of that replaces the organizational work of deciding who reviews access and how often. A library gives you the record to point to when someone asks; it doesn't run the review for you.

## Bottom line

The build-vs-buy literature isn't wrong about the costs it describes — a from-scratch authorization service really does need two-plus dedicated engineers and months of runway, and a managed platform really does trade that for a recurring bill. What it misses is that most teams don't need either, because their actual requirement — roles, permissions, an audit trail, multi-tenant isolation — fits inside a library, not a service. That's a cost line that never shows up on the diligence memo, because it was never opened in the first place.

```bash
npm install rbac-fs
```

More at the [docs site](https://imchintoo.github.io/rbac-fs/), on [npm](https://www.npmjs.com/package/rbac-fs), and on [GitHub](https://github.com/imchintoo/rbac-fs).
