---
title: Signs your RBAC model is about to outgrow itself
date: 2026-08-18
excerpt: The concrete symptoms that separate "this needs a condition" from "this needs a relationship graph" — and the honest, incremental path if you're actually in the second category.
tags: architecture, multi-tenant, rbac
---

Every team on plain role-based access control eventually has the same meeting. Someone asks for a permission rule that doesn't fit cleanly into "role X can do Y," an engineer bolts on a new role to cover the exception, and six months later nobody remembers what half the roles in the system actually gate. The question this post is about isn't "RBAC or something fancier" in the abstract — it's how you tell, from inside a team that's been perfectly happy on RBAC for a year or two, that you're approaching the point where the model itself is the problem, not your implementation of it.

That distinction matters because the two failure modes look similar from a distance but need completely different fixes. One is solved by a better condition. The other needs an actual relationship graph, and no amount of clever role-naming gets you there.

## What role explosion actually looks like

"Role explosion" isn't a precise term, but the symptoms are specific enough to be useful. [AuthZed](https://authzed.com/learn/rbac-vs-rebac-when-to-use-which) — a company that sells a relationship-based authorization engine, and is unusually candid about when you *don't* need one — describes RBAC's scaling problem as "usually more administrative than technical, emerging from the proliferation of roles as permission granularity increases." That's the mechanism: nobody makes an architectural decision to abandon RBAC, they just keep adding roles until the role list itself becomes unmanageable.

[Hoop.dev's writeup on the pattern](https://hoop.dev/blog/stopping-rbac-role-explosion-at-scale) names the concrete tells: "every new project needs a bespoke role," roles named things like `role_dev_ext_temp7` that nobody remembers the purpose of six months later, "least privilege becomes impossible to enforce," and — the one that actually shows up in retros — engineers start being afraid to touch role configuration because they can't predict what breaks. If any of that sounds familiar, it's worth pausing before adding the next role and asking what it's actually standing in for.

Here's the pattern underneath almost every case of role explosion: someone needed a permission that depends on a *relationship* between the user and the specific resource — "the owner of this document," "a member of the team this project belongs to," "anyone with edit access to the parent folder" — and the only tool available was a new role. Roles are a poor substitute for relationships. You end up with `document-47-editor`, `document-48-editor`, `document-49-editor`, one role per resource instance, because the role model has no native way to say "editor of *this specific thing*."

## The test: is this a condition, or a relationship?

Not every exception is a sign you've outgrown RBAC. The useful test is whether the rule depends on data you already have about the *current* user and resource, or whether it depends on traversing a chain of other relationships to get there.

"An employee can approve their own expense report, but not someone else's" is a condition — it's evaluated against fields already present on the request (the requester's ID, the report's owner field). rbac-fs handles this class of rule with its composable `condition` tree (`and`/`or`/`not` over a fixed operator vocabulary — `eq`, `in`, `contains`, `exists`, and so on), evaluated with zero `eval()` or `Function()` calls, ever. No new role, no per-resource role variant, just a rule attached to the existing one.

"A user who is an editor on this folder should also be an editor on every file inside it, including files added after the fact" is not a condition — it's a relationship that has to be traversed at check time, potentially through several levels of nesting, and the answer changes as the folder's contents change without anyone updating a role assignment. That's the shape of problem [ReBAC engines exist for](https://www.permit.io/blog/rbac-vs-rebac): parent-child hierarchies and group membership that need to be *derived*, not enumerated. rbac-fs's `inherits` mechanism gives you role-to-role inheritance (with `CircularInheritanceError` protection against cycles), which covers a real slice of this — "a Senior Editor inherits everything an Editor can do" is exactly what it's for — but it inherits permissions between roles, not between resource instances. It can't express "editor of this folder implies editor of this file," because that relationship lives between two pieces of data, not two roles.

If most of your exceptions are the first kind, you're not close to outgrowing RBAC — you just need to use the condition tree instead of minting a role. If you're finding yourself wanting to write "and also everyone who has access to the parent of this thing," that's the second kind, and it's worth naming explicitly before it turns into forty near-duplicate roles.

## The migration path nobody needs to panic about

The reassuring part of the research here is that nobody credible recommends a rewrite. AuthZed's own FAQ on this exact question describes a gradual approach: "start by identifying a feature that suffers from RBAC's limitations, such as per-document sharing, and implement it using a ReBAC service. Keep the existing RBAC system for coarse-grained permissions while routing fine-grained checks to the new service." Permit.io's comparison lands on a similar note from the opposite direction, calling RBAC and ReBAC "more thinking tools than concrete guidelines" and pointing out that most real systems end up mixing models rather than picking one.

That maps onto how rbac-fs is actually meant to be outgrown, if it ever needs to be: coarse role checks (can this user access the admin panel, can this role approve invoices) and attribute-scoped conditions (their own report, their own tenant) stay exactly where they are — they're not the part of your system that's straining. The one resource type that's actually developed a real sharing graph — usually something like documents, folders, or projects with nested, transitive access — is the only piece that needs a dedicated relationship layer next to it. You're not migrating a system; you're adding a second, narrower tool next to the one that's still doing its job everywhere else.

## Bottom line

Most permission systems that feel like they're outgrowing RBAC are actually outgrowing a role list that's being used to fake relationships it was never built to express. Before reaching for a relationship-graph engine, check whether the actual rule is a condition on data you already have — rbac-fs's condition tree and role inheritance cover a lot more of that territory than teams assume. If you genuinely have transitive, many-to-many sharing on one specific resource type, that's real, and it's fine to bring in a purpose-built tool for exactly that resource — while leaving the rest of your permission model, and the audit trail attached to it, right where it is.

```bash
npm install rbac-fs
```

More at the [docs site](https://imchintoo.github.io/rbac-fs/), on [npm](https://www.npmjs.com/package/rbac-fs), and on [GitHub](https://github.com/imchintoo/rbac-fs).
