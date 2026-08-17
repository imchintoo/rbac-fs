---
title: rbac-fs vs OPA vs Zanzibar-style authorization
date: 2026-08-17
excerpt: OPA/Rego and Zanzibar-style engines like OpenFGA and SpiceDB solve real problems rbac-fs doesn't — here's what each actually costs to operate, and an honest line for where rbac-fs stops being the right tool.
tags: comparison, opa, rebac
---

If you've spent any time researching authorization tooling in 2026, you've run into two categories that get recommended by default: general-purpose policy engines (OPA/Rego, and its more app-focused cousins like Cerbos) and relationship-based access control engines built on Google's Zanzibar paper (OpenFGA, SpiceDB, Permify). Both categories are genuinely good at what they do. Neither is what most teams evaluating rbac-fs actually need, and it's worth being specific about why, instead of leaving it as a vague "rbac-fs is simpler" claim.

## What Zanzibar-style engines are actually built for

OpenFGA, SpiceDB, and Permify all implement the same core idea: permissions as a graph of typed relationships between objects, resolved at query time by traversing that graph. A document is viewable if you're a viewer of the document, or an editor of the project it belongs to, or a member of the organization that owns the project — and any of those paths can independently grant access. That's the actual shape of permissions in products like Google Drive or Slack, where sharing is transitive and multi-path by design.

To do that well, all three engines need a persistent relationship store. [PkgPulse's 2026 comparison](https://www.pkgpulse.com/guides/openfga-vs-permify-vs-spicedb-zanzibar-authorization-2026) is specific about the backend requirements: OpenFGA runs on Postgres, MySQL, or SQLite (dev only); SpiceDB adds CockroachDB and Spanner for multi-region deployments; Permify defaults to Postgres. None of them are embeddable libraries — they're services you deploy, scale, and keep available, because a permission check that can't reach its relationship store can't answer at all.

The storage cost isn't hypothetical. The same guide walks through the standard mitigation — using group/org membership as an intermediate node instead of storing one tuple per user-resource pair, to avoid N×M tuple explosion — and still lands on "tens of millions of tuples and tens of gigabytes of storage" for a SaaS app with 10,000 users and 100,000 documents. That's before you've added a caching layer (all three recommend Redis or Memcached for hot-object lookups) or worked out your consistency model — SpiceDB's ZedTokens and Permify's snapshot tokens both exist because "check this permission" and "the write that granted it" can legitimately race across a distributed store.

Audit logging is the other place the operational cost hides. SpiceDB's Watch API streams relationship changes in real time, which is genuinely useful for compliance logging. OpenFGA and Permify don't have an equivalent — PkgPulse's own compliance section is blunt about it: "OpenFGA does not currently provide a built-in Watch API, requiring application-level event logging for audit purposes. Permify similarly relies on application-level logging of permission changes." Two out of three of the leading ReBAC engines expect *you* to build the audit trail on top of them.

None of this is a knock on OpenFGA, SpiceDB, or Permify — it's the correct cost for the problem they solve. If your product genuinely has transitive, multi-path sharing, a relationship graph and a database to store it in are not optional extras, they're the mechanism.

## What OPA/Rego costs that isn't in the pitch

The other default recommendation is Open Policy Agent, and its cost shows up differently — not in infrastructure, but in who can safely touch the policy. Rego is a Datalog-inspired declarative language, and [NHI Mgmt Group's 2026 analysis of Cerbos vs. OPA](https://nhimg.org/articles/policy-engines-for-app-and-api-authorization-cerbos-vs-opa/) frames that expressiveness as a governance risk as much as a feature: "the main risk is specialist dependency… teams can accumulate hidden policy complexity, inconsistent input schemas, and brittle exception handling that is difficult to govern at scale." Their recommendation isn't "avoid OPA" — it's "treat language complexity as an operational risk, not just a tooling preference," and to judge any policy engine by "reviewability, policy ownership, and operational fit," not raw expressive power.

There's a more basic issue underneath the governance question, too: OPA has no built-in concept of a user, a role, or a resource hierarchy. You model all of that yourself, in Rego and JSON data files, every time. [Aserto's operational critique](https://www.aserto.com/blog/the-challenges-of-using-opa-for-application-authorization) — old enough that its proposed fix, wrapping policy bundles in OCI images for versioning and signing, has since become a CNCF Sandbox project — points at the same gap from the deployment side: OPA policy bundles ship with no built-in versioning, naming, or signing convention, so knowing "is the policy currently running the one I intended to ship" is a problem teams have had to solve for themselves for years.

Again — not a flaw, just a design tradeoff. OPA is general-purpose on purpose, because it's meant to express policy across infrastructure and application layers at once, not just "can this user do this thing to this resource."

## What rbac-fs actually is, by contrast

rbac-fs doesn't compete with either category, because it's solving a narrower problem: role-based access control with conditions, for the very common case where "who can do what" doesn't require a relationship graph or general-purpose policy logic. Roles, permissions, and role inheritance (via `inherits`, with cycle detection via `CircularInheritanceError`) live as plain JSON files under `.rbac/` — no database, no service to run, no separate deployment to keep available. Multi-tenancy is folder isolation (`.rbac/tenants/<id>/...`), with `_shared/` as a genuinely separate, non-inheritable namespace for platform-level roles, rather than tenancy modeled as a query-time filter on shared tables.

Conditional logic covers the "approve your own expense report" class of rule — a composable tree of `and`/`or`/`not` over a fixed operator vocabulary (`eq`, `gt`, `in`, `contains`, `startsWith`, and so on), evaluated without `eval()` or `Function()` anywhere in the path, ever. It's not Rego — there's no general-purpose language, no way to express an arbitrary policy that spans systems. It's deliberately smaller than that.

Audit logging is built into Core Engine, not bolted on afterward the way it is for OpenFGA and Permify: every allow/deny decision writes to `logs/<role>.jsonl`, one record per line, with configurable rotation (`maxSize`, `maxAge`, `compress`, `maxBackups`). Role files are hand-editable and picked up live via a chokidar-backed watcher (disable with `{ cache: false }` if you'd rather not). The permission-evaluation path — `can()`, resolution, condition evaluation — has zero third-party runtime dependencies. It runs in Node and the browser from one package, JS or TS, with eight built-in framework adapters (NestJS, Express, Fastify, Koa, React, Vue, Angular, Svelte).

## Where rbac-fs stops being the right answer

The honest version of this comparison has to name the ceiling. rbac-fs's inheritance model is a role hierarchy, not a relationship graph — a role can inherit from another role, but there's no way to express "you can view this document because you're a member of a group that has access to the folder that contains it," where access legitimately arrives through more than one independent path. That's precisely the shape Zanzibar-style engines were built to resolve efficiently at scale, and it's not something a condition tree or `inherits` chain can retrofit. If your actual permission model is transitive, multi-path resource sharing — Drive-style or Slack-style — reach for OpenFGA, SpiceDB, or Permify, and budget for the database and the service that comes with them.

Similarly, if your policy problem spans infrastructure and application layers at once, or needs to be authored by a dedicated platform team that already owns policy-as-code tooling elsewhere, OPA's generality is the point, not a liability, and rbac-fs's fixed operator vocabulary will feel restrictive by design.

## The actual decision rule

If you can describe your permission model as "roles, maybe inherited, maybe with a condition on the request" — most SaaS apps, most B2B tools, most internal admin panels — you don't need a relationship database or a general-purpose policy language, and the operational cost both categories carry (a service to run, a store to scale, in two of three ReBAC engines an audit log you have to build yourself) is cost you're paying for a capability you're not using. If your permissions are actually graph-shaped, or your policy logic actually needs to reach outside a single request, that cost is the right trade — buy it deliberately, not by default.

## Bottom line

OPA and Zanzibar-style engines aren't overkill in the abstract — they're correctly sized for relationship graphs and cross-system policy, respectively. They're overkill for the RBAC-plus-conditions model that describes most applications, which is the gap rbac-fs is built to fill without the service, the database, or the specialist language.

```bash
npm install rbac-fs
```

Docs, framework adapter guides, and the full API reference are at [imchintoo.github.io/rbac-fs](https://imchintoo.github.io/rbac-fs/). The package is on [npm](https://www.npmjs.com/package/rbac-fs), and the source is on [GitHub](https://github.com/imchintoo/rbac-fs).
