/**
 * rbac-fs/nestjs — thin NestJS decorator + guard adapter (docs/PLAN.md
 * §3.1, docs/backlog/adr-v0.6-backend-adapters.md §3/§4).
 *
 * Zero permission logic lives here — `RbacGuard.canActivate` does exactly
 * one real thing: call the injected `RBAC`-like instance's `can(...)` and
 * translate the boolean into "let the request through" or
 * `ForbiddenException`. Metadata plumbing (`@RequirePermission`,
 * `Reflector`) and DI wiring (`RBAC_TOKEN`, `provideRbac`) exist only to
 * get `(user, resource, action, context)` out of a Nest request and into
 * that one `can()` call.
 */
import { ForbiddenException, Inject, Injectable, SetMetadata, applyDecorators, type CanActivate, type ExecutionContext, type Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RbacUser } from '../../core/types.js';

/**
 * The only shape this adapter needs from an `RBAC` instance — structural,
 * matching `rbac-fs/express`'s `RbacLike`, so this file never imports
 * anything Node-specific (no `LocalJsonAdapter`, no `RBAC` class) — see
 * §2.1's "no NestJS-only runtime assumption leaks into core" guarantee,
 * mirrored here as "no NestJS adapter dependency leaks into core" either.
 */
export interface RbacLike {
  can(user: RbacUser, resource: string, action: string, context?: Record<string, unknown>): Promise<boolean>;
}

/** DI token a consumer binds their `RBAC` instance to — see `provideRbac`. */
export const RBAC_TOKEN = 'RBAC_FS_INSTANCE';

export const REQUIRE_PERMISSION_KEY = 'rbac-fs:permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/**
 * Method- or class-level metadata: "this route needs `can(user, resource,
 * action)` to be true." A route with no `@RequirePermission()` is let
 * through unchecked by `RbacGuard` (opt-in per-route, fail-open on missing
 * metadata by design — see ADR §3's consequences note; authentication
 * itself remains the consumer's own guard's job, e.g. `AuthGuard('jwt')`
 * applied alongside this one).
 */
export function RequirePermission(resource: string, action: string): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action } satisfies RequiredPermission));
}

/**
 * One-line provider helper for a consumer's `@Module({ providers: [...] })`
 * — binds their `RBAC` instance to `RBAC_TOKEN` so `RbacGuard` can inject
 * it. Deliberately not a `RbacModule.forRoot()` dynamic module — see ADR §3
 * / story "explicitly out of scope" #2.
 */
export function provideRbac(rbac: RbacLike): Provider {
  return { provide: RBAC_TOKEN, useValue: rbac };
}

/** Minimal request shape this guard actually reads — real Express/Fastify request objects satisfy this structurally. */
interface RbacGuardRequest {
  user?: RbacUser;
  [key: string]: unknown;
}

/**
 * `CanActivate` guard: reads `@RequirePermission()` metadata (method
 * overrides class, via `Reflector.getAllAndOverride`), extracts the user
 * (default `req.user` — override by subclassing, see `getUser`), and calls
 * `rbac.can(...)`. Throws `ForbiddenException` on deny or on a missing
 * user for a guarded route.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  // Both params are explicitly @Inject()-ed, including `Reflector` (which
  // Nest can normally resolve from TS's emitted `design:paramtypes`
  // metadata alone). We ship a tsup/esbuild-built dist, not a tsc one —
  // esbuild doesn't emit that metadata without the optional @swc/core
  // plugin (confirmed by inspecting the built output; see
  // docs/backlog/lessons.md) — so relying on implicit type-based DI here
  // would silently break in the published package even though it works
  // fine against `src/` in this repo's own tsc-typechecked tests.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RBAC_TOKEN) private readonly rbac: RbacLike,
  ) {}

  /** Override in a subclass to extract the user differently — mirrors `rbacMiddleware`'s `options.getUser`, adapted to Nest's DI-constructed-class idiom (see ADR §4). */
  protected getUser(req: RbacGuardRequest): RbacUser | undefined {
    return req.user;
  }

  /** Override in a subclass to supply conditional-grant (`when`) context. Default: no extra context. */
  protected getContext(_req: RbacGuardRequest): Record<string, unknown> {
    return {};
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!required) {
      return true; // no @RequirePermission() on this route — not this guard's concern
    }

    const req = context.switchToHttp().getRequest<RbacGuardRequest>();
    const user = this.getUser(req);
    if (!user) {
      throw new ForbiddenException();
    }

    const allowed = await this.rbac.can(user, required.resource, required.action, this.getContext(req));
    if (!allowed) {
      throw new ForbiddenException();
    }

    return true;
  }
}
