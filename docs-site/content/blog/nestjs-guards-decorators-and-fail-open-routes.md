---
title: "NestJS guards: why unguarded routes fail open"
date: 2026-07-08
excerpt: rbac-fs's NestJS adapter is opt-in per route via @RequirePermission() — a route with no decorator is allowed through unchecked, deliberately.
tags: nestjs, adapters
---

`rbac-fs/nestjs` gives you `RbacGuard`, `@RequirePermission()`, and `provideRbac()` — a decorator-driven guard, not a global middleware that inspects every route.

## The shape

```ts
import { Controller, Post, UseGuards, Module } from '@nestjs/common';
import { RbacGuard, RequirePermission, provideRbac } from 'rbac-fs/nestjs';

@Controller('invoices')
export class InvoiceController {
  @Post(':id/approve')
  @UseGuards(RbacGuard)
  @RequirePermission('invoice', 'approve')
  approve() {
    return { approved: true };
  }

  @Post(':id/comment') // no @RequirePermission() -> RbacGuard lets it through unchecked
  comment() {
    return { commented: true };
  }
}

@Module({
  controllers: [InvoiceController],
  providers: [provideRbac(rbac)], // binds your RBAC instance to RBAC_TOKEN
})
export class AppModule {}
```

## Why fail-open on missing metadata, not fail-closed

A route decorated with `@UseGuards(RbacGuard)` but no `@RequirePermission()` is let through unchecked, rather than rejected. This is opt-in by design: `RbacGuard` only enforces what you've explicitly declared. It's not a substitute for authentication — pair it with your own auth guard (`AuthGuard('jwt')` or equivalent) so `request.user` is already populated by the time `RbacGuard` runs.

## What happens without a user on the request

```ts
// route has @RequirePermission() but request.user is missing
await guard.canActivate(context); // throws ForbiddenException
```

Missing `request.user` on a *guarded* route throws — that combination (decorator present, user absent) is the one case `RbacGuard` treats as a hard failure, since there's nothing to evaluate against.

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html#rbac-node-core-import-rbac-from-rbac-fs">Full adapter API reference →</a></div>

For a step-by-step demo you can run with `tsx`, no `@nestjs/cli` build required, see [Tutorial: wiring up the NestJS adapter](/blog/tutorial-nestjs-rbacguard-walkthrough.html).
