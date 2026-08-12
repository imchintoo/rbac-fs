/**
 * 10 — NestJS: @RequirePermission() decorator + RbacGuard + provideRbac().
 * A route with no @RequirePermission() is let through unchecked (opt-in
 * per-route) — pair RbacGuard with your own auth guard (e.g. AuthGuard('jwt'))
 * so `request.user` is populated before this guard runs.
 *
 * Run: node --import tsx examples/10-nestjs-guard.ts
 *
 * NOTE on why this file doesn't boot a live HTTP server: a real NestJS app
 * is built via `@nestjs/cli` (tsc or SWC), which emits the
 * `design:paramtypes` metadata Nest's `@Post()`/`@Controller()` decorators
 * need. This demo runs under `tsx` (esbuild) for a zero-install one-liner,
 * and esbuild's decorator transform doesn't emit that metadata for Nest's
 * own HTTP routing decorators (documented in src/adapters/nestjs/index.ts's
 * RbacGuard comment — the same reason RbacGuard's constructor explicitly
 * @Inject()s Reflector instead of relying on implicit DI). See the
 * "Real app wiring" block below for the copy-pasteable controller/module
 * code — verification here drives RbacGuard directly with a real Reflector
 * and a real ExecutionContext instead, the same approach
 * test/nestjs-adapter.test.ts uses to keep this adapter's test suite green.
 */
import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC } from 'rbac-fs';
import { provideRbac, RbacGuard, RequirePermission, REQUIRE_PERMISSION_KEY } from 'rbac-fs/nestjs';

/* ---------------------------------------------------------------------------
 * Real app wiring — copy this into your NestJS project as-is:
 *
 *   import { Controller, Post, UseGuards, Module } from '@nestjs/common';
 *   import { RbacGuard, RequirePermission, provideRbac } from 'rbac-fs/nestjs';
 *
 *   @Controller('invoices')
 *   export class InvoiceController {
 *     @Post(':id/approve')
 *     @UseGuards(RbacGuard)
 *     @RequirePermission('invoice', 'approve')
 *     approve() {
 *       return { approved: true };
 *     }
 *
 *     @Post(':id/comment') // no @RequirePermission() -> RbacGuard lets it through unchecked
 *     comment() {
 *       return { commented: true };
 *     }
 *   }
 *
 *   @Module({
 *     controllers: [InvoiceController],
 *     providers: [provideRbac(rbac)], // binds your RBAC instance to RBAC_TOKEN
 *   })
 *   export class AppModule {}
 * ------------------------------------------------------------------------- */

// A plain class standing in for InvoiceController above — same
// @RequirePermission() metadata, just without Nest's own @Post()/@Controller()
// decorators (see file header for why those are excluded from this
// tsx-run demo specifically, not from real usage).
class InvoiceController {
  @RequirePermission('invoice', 'approve')
  approve(): { approved: true } {
    return { approved: true };
  }

  // Deliberately no @RequirePermission() — proves the fail-open-on-missing-metadata path.
  comment(): { commented: true } {
    return { commented: true };
  }
}

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] }, { force: true });
await rbac.createRole('viewer', { permissions: [{ resource: 'invoice', actions: ['view'] }] }, { force: true });

const app = provideRbac(rbac); // exactly what goes in @Module({ providers: [...] })
console.log('provider for @Module({ providers: [...] }):', app);

const guard = new RbacGuard(new Reflector(), rbac);

function contextFor(handler: () => unknown, request: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => InvoiceController,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}), getNext: () => undefined }),
  } as unknown as ExecutionContext;
}

console.log('@RequirePermission metadata on approve():', Reflect.getMetadata(REQUIRE_PERMISSION_KEY, InvoiceController.prototype.approve));

const managerCtx = contextFor(InvoiceController.prototype.approve, { user: { id: 'u1', role: 'manager' } });
console.log('manager approving invoice (guarded route) ->', await guard.canActivate(managerCtx));

const noMetaCtx = contextFor(InvoiceController.prototype.comment, { user: { id: 'u1', role: 'manager' } });
console.log('route with no @RequirePermission() -> allowed unchecked:', await guard.canActivate(noMetaCtx));

try {
  await guard.canActivate(contextFor(InvoiceController.prototype.approve, {})); // no req.user
} catch (err) {
  console.log('missing user on a guarded route throws ForbiddenException:', err instanceof ForbiddenException);
}

try {
  await guard.canActivate(contextFor(InvoiceController.prototype.approve, { user: { id: 'u2', role: 'viewer' } }));
} catch (err) {
  console.log('user without the permission throws ForbiddenException:', err instanceof ForbiddenException);
}

await rbac.close();
