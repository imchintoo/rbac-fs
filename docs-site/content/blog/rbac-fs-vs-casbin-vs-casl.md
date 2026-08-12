---
title: "rbac-fs vs Casbin vs CASL"
date: 2026-08-10
excerpt: Three real libraries, three different trade-offs — storage model, framework coverage, and what happens when you need to audit a permission change.
tags: comparison, casbin, casl
---

If you're evaluating authorization libraries for a Node.js project in 2026, three names come up repeatedly: Casbin, CASL, and `rbac-fs`. They solve overlapping problems in genuinely different ways — this is the honest comparison, not a marketing one, and it's worth reading even if you end up choosing one of the other two.

## Storage model

Casbin is model-plus-policy: you define an access-control model (RBAC, ABAC, ACL, or a custom one) in a `.conf` file, then store the actual policy data in a file adapter or a database adapter. It's the most flexible of the three because it isn't RBAC-specific at all — it's a general policy-evaluation engine.

CASL is in-memory and bring-your-own-storage. You define abilities in code ("can user X do Y on resource Z"), and CASL evaluates them against objects you pass in. Nothing about persistence is CASL's concern — that's a deliberate, isomorphic-first design that works identically in Node and the browser.

`rbac-fs` stores roles as JSON files under `.rbac/`, one file per role, tenant-isolated by folder. See [Core Concepts](/docs/core-concepts.html) for the full model. This is the narrowest of the three storage stories — it's RBAC-specific, not a general policy engine — but it's the only one of the three where the storage format is, by default, something you'd put in a pull request.

## Framework coverage

`rbac-fs` ships 8 framework adapters in the same package: NestJS, Express, Fastify, Koa, React, Vue, Angular, and Svelte — see the [full adapter list](/docs/api-reference.html). Casbin's ecosystem is Node-focused with less first-party frontend story. CASL has strong TypeScript support and is isomorphic by design, with community integrations for Prisma and Mongoose specifically.

If your app spans multiple backend frameworks or needs the same permission check on both server and client without re-deriving the logic, that's where `rbac-fs`'s adapter breadth or CASL's isomorphic design both do real work — Casbin leans more heavily toward backend-only usage.

## Multi-tenancy

This is the sharpest difference. Casbin and CASL both leave multi-tenant isolation to you — it's a modeling decision you make within their systems (a tenant field in your policy rows, a tenant check in your ability conditions), not something built in. `rbac-fs` makes tenant isolation structural: each tenant gets its own folder under `.rbac/tenants/<tenantId>/`, so tenant A's adapter calls cannot read tenant B's files, including under adversarial `tenantId` input (path traversal is rejected outright — see [Security Guardrails](/docs/security.html)). See [Multi-tenant permissions without a database](/blog/multi-tenant-permissions-without-a-database.html) for the deeper dive on why that matters.

## When each one is the right call

- **Casbin** — you need a general policy engine (RBAC isn't the only model in play, or you need ABAC-style attribute conditions beyond what a fixed operator set gives you).
- **CASL** — you're TypeScript-first, want the same ability checks isomorphically in Node and React without a filesystem dependency, and you're comfortable owning storage yourself.
- **`rbac-fs`** — RBAC specifically is the model you need, multi-tenancy is a first-class requirement, and you want permission changes to be PR-reviewable by construction rather than by discipline.

None of these is a strictly-better replacement for the others — they're solving adjacent problems with different defaults. Read the [Quick Start](/docs/quick-start.html) if the file-based, multi-tenant model above fits what you're building.
