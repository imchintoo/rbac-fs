---
title: "Tutorial: wiring up the NestJS RbacGuard"
date: 2026-07-06
excerpt: A runnable walkthrough of rbac-fs's NestJS guard and decorator, driving RbacGuard directly so you can see every outcome without booting a full Nest app.
tags: nestjs, tutorial
---

This drives `RbacGuard` directly against a `Reflector` and a fake `ExecutionContext` — the same technique the adapter's own test suite uses — so you can see all four outcomes without a full `@nestjs/cli` build step.

## Set up roles and the guard

```ts
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { RBAC } from 'rbac-fs';
import { RbacGuard, RequirePermission } from 'rbac-fs/nestjs';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });
await rbac.createRole('viewer', { permissions: [{ resource: 'invoice', actions: ['view'] }] }, { force: true });

const guard = new RbacGuard(new Reflector(), rbac);
```

## A controller with one guarded route, one not

```ts
class InvoiceController {
  @RequirePermission('invoice', 'approve')
  approve(): { approved: true } {
    return { approved: true };
  }

  comment(): { commented: true } { // deliberately no @RequirePermission()
    return { commented: true };
  }
}
```

## Run all four scenarios

```ts
function contextFor(handler, request) {
  return {
    getHandler: () => handler,
    getClass: () => InvoiceController,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}), getNext: () => undefined }),
  };
}

// 1. manager, guarded route -> allowed
await guard.canActivate(contextFor(InvoiceController.prototype.approve, { user: { id: 'u1', role: 'manager' } })); // true

// 2. no decorator on the route -> allowed unchecked
await guard.canActivate(contextFor(InvoiceController.prototype.comment, { user: { id: 'u1', role: 'manager' } })); // true

// 3. guarded route, no request.user -> throws
await guard.canActivate(contextFor(InvoiceController.prototype.approve, {})); // ForbiddenException

// 4. viewer without the permission -> throws
await guard.canActivate(contextFor(InvoiceController.prototype.approve, { user: { id: 'u2', role: 'viewer' } })); // ForbiddenException
```

Run this yourself with `node --import tsx` — no Angular-style AOT/JIT pipeline needed for this level of verification, since it bypasses Nest's own `@Post()`/`@Controller()` decorators (which do need the real `@nestjs/cli` build to emit `design:paramtypes` metadata).

<div class="related-link"><span class="related-label">Related</span><a href="/blog/nestjs-guards-decorators-and-fail-open-routes.html">Why unguarded routes fail open by design →</a></div>

Verified against [`examples/10-nestjs-guard.ts`](https://github.com/imchintoo/rbac-fs/blob/main/examples/10-nestjs-guard.ts), which runs this exact sequence.
