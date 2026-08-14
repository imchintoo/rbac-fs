---
title: Why the permission check has zero dependencies
date: 2026-08-14
excerpt: 2026's npm supply-chain attacks got names and dates — here's why the code path that decides who's allowed to do what is the worst place to carry that exposure, and what rbac-fs does about it specifically.
tags: security, core-engine, architecture
---

Three separate npm supply-chain attacks landed in 2026, and unlike the vague "dependencies are risky" warnings that have circulated for years, each one now has a name, a date, and a download count attached. That specificity matters, because it turns an abstract argument about dependency hygiene into a concrete question every team should be asking about one code path in particular: the one that decides who's allowed to do what.

## Three incidents, not a statistic

The self-propagating worm known as "Shai-Hulud" was first seen in September 2025 and kept spreading through 2026. It works by stealing npm and cloud tokens from a compromised package, then using those tokens to automatically republish itself into more packages — no human attacker needed after the initial foothold. According to [Singapore's Cyber Security Agency advisory](https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-009/) and [Wiz's writeup on the keyv and cacheable compromise](https://www.wiz.io/blog/keyv-and-cacheable-npm-supply-chain-attack), the affected packages combined represent more than 2 billion monthly downloads.

Then on March 31, 2026, [CISA issued an alert](https://www.cisa.gov/news-events/alerts/2026/04/20/supply-chain-compromise-impacts-axios-node-package-manager) covering two malicious versions of axios — a package with roughly 100 million weekly downloads — published and pulled within about three hours. Google attributed the compromise to the North Korean group UNC1069. Three hours sounds short, but for a dependency installed automatically on every `npm install` across thousands of CI pipelines, it's plenty of time to do damage before anyone notices.

In June 2026, [StepSecurity documented](https://www.stepsecurity.io/blog/mastra-npm-packages-compromised-using-easy-day-js) an attacker who compromised the @mastra npm organization directly and quietly added a malicious dependency, easy-day-js, across more than 140 packages in the Mastra AI framework ecosystem. No typosquat, no phishing email to a maintainer — just a compromised publishing credential and a dependency graph that trusted it.

[Unit 42's ongoing tracking](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) of the npm threat landscape describes the pattern common to all three: attackers don't breach the target directly. They compromise a dependency the target already trusts, then let automatic installs and routine updates do the distribution work. Nobody has to click a phishing link. They just have to run `npm install` on a normal Tuesday.

## Why this matters more for an authorization library than almost anything else

Every dependency in a Node project is a liability in the sense that it's code you didn't write, running with the same privileges as the code you did. But not every dependency carries the same blast radius if it's compromised. A backdoored logging library can exfiltrate data. A backdoored date-formatting utility (which is exactly what easy-day-js's name suggests it pretends to be) can do the same, or worse, depending on what else it can reach.

A backdoored authorization library can grant access. That's a different category of risk — not "this package might leak something," but "this package is the thing standing between a request and the data or action it's asking for, and it just got quietly rewritten by someone who isn't on your team." If the code path that evaluates `can(user, 'delete', 'invoice')` has a compromised transitive dependency somewhere in its call graph, the attacker doesn't need to find a separate authorization bypass — they already own the function that returns `true` or `false`.

This is also the argument that's easy to miss when supply-chain risk gets discussed in aggregate. [DeepStrike's supply-chain statistics](https://deepstrike.io/blog/supply-chain-statistics) (66% of critical long-lived vulnerabilities trace back to third-party code, modern JS projects routinely carry 500+ transitive packages) are true and worth knowing, but they treat all dependencies as roughly equivalent risk. They're not. A dependency in your test tooling and a dependency in your permission-evaluation path are not the same bet.

## What rbac-fs does about it, specifically

The Core Engine's `can()` resolution — role loading, inheritance walking, condition evaluation — has zero third-party runtime dependencies. There's no policy DSL parser pulled in from npm, no embedded query language, no ORM, nothing sitting between your `can()` call and the JSON files under `.rbac/` except code that's reviewed as part of this package's own release process.

To be precise about scope, because vague zero-dependency claims aren't worth much: `rbac-fs` as a whole package is not dependency-free. The live-reload feature uses `chokidar` to watch role files for hand edits and invalidate the in-memory cache — that's a real, if small, transitive dependency footprint, and it's disableable with `{ cache: false }` if you'd rather not carry it at all. But chokidar sits in the file-watching path, not the decision path. If it were compromised tomorrow, the worst case is a broken or malicious cache-invalidation trigger — not a `can()` call that silently returns `true` for a request it should have denied. That's a meaningfully different blast radius, and it's why the zero-dependency claim is scoped specifically to permission evaluation rather than claimed for the whole package.

The condition system follows the same logic for a related reason: `and`/`or`/`not` over a fixed, closed set of operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `exists`, `notExists`, `contains`, `startsWith`, `endsWith`), never `eval()` or `Function()`, ever. That's not primarily a supply-chain argument — it's about not giving a condition string the ability to execute arbitrary code — but it rhymes with the same underlying principle: the fewer places in the permission-evaluation path where external code (whether a dependency or a string someone else wrote) can influence the outcome, the smaller the attack surface on the one function whose job is to say yes or no.

## What this doesn't solve

Zero dependencies in the decision path doesn't mean zero risk anywhere. `rbac-fs` itself is still a package you're installing from npm, and you should apply the same scrutiny to it that this post argues for applying to any authorization dependency — check the maintainer, check the release history, don't blindly auto-update a security-critical package on `^` semver ranges without review. The eight framework adapters (NestJS, Express, Fastify, Koa, React, Vue, Angular, Svelte) each carry their framework as a peer dependency, which is unavoidable and outside this scope entirely. And "zero dependencies in the code that decides access" doesn't protect you from a compromised dependency somewhere else in your stack reading data it was never supposed to see in the first place — authorization only covers requests that go through it.

## Bottom line

2026 turned "supply-chain risk" from a hypothetical into a list of dated incidents with real download counts attached. Most of that risk is evenly distributed across a typical dependency tree. It shouldn't be. The function that decides who's allowed to do what deserves a smaller attack surface than your date-formatting utility, not the same one — and that's a property you can check directly in `rbac-fs`'s Core Engine, not one you have to take on faith.

```bash
npm install rbac-fs
```

More at the [docs site](https://imchintoo.github.io/rbac-fs/), on [npm](https://www.npmjs.com/package/rbac-fs), and on [GitHub](https://github.com/imchintoo/rbac-fs).
